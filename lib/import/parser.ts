import * as XLSX from 'xlsx'
import Papa from 'papaparse'
import {
  ImportRow,
  ImportPreviewRow,
  MappedRow,
  ImportValidationError,
  TMDBMatchResult,
  DuplicateType,
} from '@/types/import'
import { detectColumnMapping, mapRow } from './columnMapper'
import { MediaEntry } from '@/types/media'
import { findMetadataMatch } from '@/lib/providers/metadata'

export interface ParsedImportData {
  headers: string[]
  rows: ImportRow[]
  columnMapping: Record<string, string>
}

// ---------------------------------------------------------------------------
// File parsing
// ---------------------------------------------------------------------------

export async function parseExcelFile(file: File): Promise<ParsedImportData> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = (e) => {
      try {
        const data = e.target?.result
        const workbook = XLSX.read(data, { type: 'binary', cellDates: true })
        const sheetName = workbook.SheetNames[0]
        const worksheet = workbook.Sheets[sheetName]
        const jsonData = XLSX.utils.sheet_to_json<ImportRow>(worksheet, {
          defval: null,
          raw: false,
        })

        if (jsonData.length === 0) {
          reject(new Error('The spreadsheet is empty'))
          return
        }

        const headers = Object.keys(jsonData[0])
        const columnMapping = detectColumnMapping(headers)

        resolve({ headers, rows: jsonData, columnMapping })
      } catch (err) {
        reject(new Error(`Failed to parse Excel file: ${(err as Error).message}`))
      }
    }
    reader.onerror = () => reject(new Error('Failed to read file'))
    reader.readAsBinaryString(file)
  })
}

export async function parseCSVFile(file: File): Promise<ParsedImportData> {
  return new Promise((resolve, reject) => {
    Papa.parse(file, {
      header: true,
      skipEmptyLines: true,
      complete: (results) => {
        const rows = results.data as ImportRow[]
        if (rows.length === 0) {
          reject(new Error('The CSV file is empty'))
          return
        }
        const headers = results.meta.fields || []
        const columnMapping = detectColumnMapping(headers)
        resolve({ headers, rows, columnMapping })
      },
      error: (error) => reject(new Error(`Failed to parse CSV: ${error.message}`)),
    })
  })
}

export async function parseImportFile(file: File): Promise<ParsedImportData> {
  const ext = file.name.toLowerCase().split('.').pop()
  if (ext === 'csv') return parseCSVFile(file)
  if (ext === 'xlsx' || ext === 'xls') return parseExcelFile(file)
  throw new Error('Unsupported file format. Please use .xlsx or .csv')
}

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------

export function validateMappedRow(
  mapped: MappedRow,
  rowIndex: number
): ImportValidationError[] {
  const errors: ImportValidationError[] = []

  if (!mapped.title) {
    errors.push({ row: rowIndex, field: 'title', message: 'Title is required' })
  }

  // Type is no longer required — TMDB or the import page will determine it.
  // We still validate if a value is provided and unrecognised.
  if (
    mapped.type !== undefined &&
    mapped.type !== null &&
    !['movie', 'series'].includes(mapped.type as string)
  ) {
    errors.push({ row: rowIndex, field: 'type', message: 'Type must be "movie" or "series"' })
  }

  if (
    mapped.personalRating !== null &&
    mapped.personalRating !== undefined &&
    (mapped.personalRating < 0 || mapped.personalRating > 10)
  ) {
    errors.push({
      row: rowIndex,
      field: 'personalRating',
      message: 'Rating must be between 0 and 10',
    })
  }

  if (
    mapped.yearMade !== null &&
    mapped.yearMade !== undefined &&
    (mapped.yearMade < 1888 || mapped.yearMade > new Date().getFullYear() + 5)
  ) {
    errors.push({ row: rowIndex, field: 'yearMade', message: 'Invalid year' })
  }

  return errors
}

// ---------------------------------------------------------------------------
// Duplicate detection helpers
// ---------------------------------------------------------------------------

/** Strip parenthetical suffixes and normalise for title similarity. */
function normaliseTitle(title: string): string {
  return title
    .toLowerCase()
    .replace(/\s*\([^)]*\)/g, '') // remove (US), (2005), etc.
    .replace(/[^a-z0-9\s]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
}

type DuplicateCheckResult = {
  isDuplicate: boolean
  needsReview: boolean
  reviewReason: string | null
  duplicateType: DuplicateType | null
  existingEntry?: MediaEntry
  similarTitles: MediaEntry[]
}

/**
 * Build the season-aware identity key for an existing entry.
 *
 * For season-specific entries: `"<tmdbId>-S<seasonNumber>"`
 * For full-series entries (no season) or entries created before season support:
 *   `"<tmdbId>-Sall"`
 *
 * This ensures Season 1 and Season 2 are treated as distinct entries even when
 * they share the same series tmdbId.
 */
function seasonKey(tmdbId: number, seasonNumber: number | null | undefined): string {
  return `${tmdbId}-S${seasonNumber ?? 'all'}`
}

function detectDuplicate(
  mapped: MappedRow,
  existingEntries: MediaEntry[],
  existingSeasonKeys: Set<string>,
  existingTitlesLower: Set<string>
): DuplicateCheckResult {
  const titleLower = mapped.title?.toLowerCase().trim() ?? ''

  // ── AUTO-SKIP #1: Exact (TMDB ID + season number) match ──────────────────
  // Same series AND same season → unambiguously the same entry.
  // Two different seasons of the same series are distinct entries.
  if (mapped.tmdbId) {
    const key = seasonKey(mapped.tmdbId, mapped.seasonNumber)
    if (existingSeasonKeys.has(key)) {
      const existingEntry = existingEntries.find(
        (e) =>
          e.tmdbId === mapped.tmdbId &&
          (e.seasonNumber ?? null) === (mapped.seasonNumber ?? null)
      )
      return {
        isDuplicate: true,
        needsReview: false,
        reviewReason: null,
        duplicateType: 'exact_tmdb',
        existingEntry,
        similarTitles: [],
      }
    }
  }

  // ── AUTO-SKIP #2: Legacy duplicate ────────────────────────────────────────
  // Title + Country + Year + Episode Count all match → same title, same version.
  // Skip automatically.
  if (titleLower) {
    const legacyMatch = existingEntries.find((e) => {
      const titleMatch = e.title.toLowerCase().trim() === titleLower
      const countryMatch =
        (!mapped.country && !e.country) ||
        (mapped.country?.toLowerCase() === e.country?.toLowerCase())
      const yearMatch =
        (!mapped.yearMade && !e.yearMade) || mapped.yearMade === e.yearMade
      const epsMatch =
        (!mapped.totalEpisodes && !e.totalEpisodes) ||
        mapped.totalEpisodes === e.totalEpisodes
      return titleMatch && countryMatch && yearMatch && epsMatch
    })
    if (legacyMatch) {
      return {
        isDuplicate: true,
        needsReview: false,
        reviewReason: null,
        duplicateType: 'legacy',
        existingEntry: legacyMatch,
        similarTitles: [],
      }
    }
  }

  // ── REVIEW: Exact title match ─────────────────────────────────────────────
  // Same name but metadata could differ (different year, region, remake, etc.).
  // Flag for review — pre-checked so it imports unless the user unchecks it.
  if (titleLower && existingTitlesLower.has(titleLower)) {
    const existingEntry = existingEntries.find(
      (e) => e.title.toLowerCase().trim() === titleLower
    )
    return {
      isDuplicate: false,
      needsReview: true,
      reviewReason: `"${mapped.title}" already exists in your list`,
      duplicateType: 'exact_title',
      existingEntry,
      similarTitles: [],
    }
  }

  // ── REVIEW: Similar title ─────────────────────────────────────────────────
  // Normalised base title matches (e.g. "The Office (US)" vs "The Office (UK)").
  // Flag for review — pre-checked.
  const normImport = normaliseTitle(mapped.title ?? '')
  const similarTitles = normImport.length > 2
    ? existingEntries.filter((e) => normaliseTitle(e.title) === normImport)
    : []

  if (similarTitles.length > 0) {
    return {
      isDuplicate: false,
      needsReview: true,
      reviewReason: `Similar to: ${similarTitles.map((e) => e.title).join(', ')}`,
      duplicateType: 'similar_title',
      similarTitles,
    }
  }

  return {
    isDuplicate: false,
    needsReview: false,
    reviewReason: null,
    duplicateType: null,
    similarTitles: [],
  }
}

// ---------------------------------------------------------------------------
// Metadata enrichment (TMDB → MDL → Excel authority chain)
// ---------------------------------------------------------------------------
// findMetadataMatch is imported from lib/providers/metadata.ts.
// It tries TMDB first; if confidence < 0.55, falls back to MDL; if both fail,
// returns no_match so the row goes to the Manual Review queue.

// ---------------------------------------------------------------------------
// Main preview builder
// ---------------------------------------------------------------------------

function isRowCompletelyEmpty(row: ImportRow): boolean {
  return Object.values(row).every(
    (v) => v === null || v === undefined || String(v).trim() === ''
  )
}

/**
 * True when a mapped row carries no importable content: no title AND no other
 * meaningful field. Such rows are ignored (not counted as validation errors),
 * even if the raw row had stray values in unmapped columns.
 */
function isMappedRowEmpty(mapped: MappedRow): boolean {
  const hasTitle = !!(mapped.title && mapped.title.trim() !== '')
  if (hasTitle) return false
  const meaningful =
    mapped.totalEpisodes != null ||
    mapped.episodeDurationMinutes != null ||
    mapped.episodeAverageDuration != null ||
    mapped.watchHours != null ||
    mapped.personalRating != null ||
    mapped.yearMade != null ||
    mapped.tmdbId != null ||
    mapped.seasonNumber != null ||
    mapped.nextEpisodeToWatch != null ||
    !!(mapped.country && mapped.country.trim() !== '') ||
    !!(mapped.ageRating && mapped.ageRating.trim() !== '') ||
    !!(mapped.dateFinished && mapped.dateFinished.trim() !== '') ||
    !!(mapped.specialNotes && mapped.specialNotes.trim() !== '') ||
    (Array.isArray(mapped.genres) && mapped.genres.length > 0)
  return !meaningful
}

export async function buildImportPreview(
  data: ParsedImportData,
  existingEntries: MediaEntry[],
  onProgress?: (current: number, total: number) => void
): Promise<{ rows: ImportPreviewRow[]; ignoredEmptyRows: number }> {
  const existingTitlesLower = new Set(existingEntries.map((e) => e.title.toLowerCase().trim()))

  const existingSeasonKeys = new Set<string>(
    existingEntries
      .filter((e) => e.tmdbId != null)
      .map((e) => seasonKey(e.tmdbId!, e.seasonNumber))
  )

  const result: ImportPreviewRow[] = []
  let ignoredCount = 0

  for (let index = 0; index < data.rows.length; index++) {
    const row = data.rows[index]

    if (isRowCompletelyEmpty(row)) {
      ignoredCount++
      result.push({
        rowIndex: index + 1,
        raw: row,
        mapped: {},
        errors: [],
        isDuplicate: false,
        needsReview: false,
        reviewReason: null,
        duplicateType: null,
        similarTitles: [],
        existingEntry: undefined,
        willImport: false,
        tmdbMatch: { status: 'no_match', result: null, confidence: 0 },
        isEmptyRow: true,
      })
      onProgress?.(index + 1, data.rows.length)
      continue
    }

    const mapped = mapRow(row, data.columnMapping)

    // A row with no title and no other meaningful data is treated as empty
    // (ignored), not as a validation error — even if unmapped columns had stray values.
    if (isMappedRowEmpty(mapped)) {
      ignoredCount++
      result.push({
        rowIndex: index + 1,
        raw: row,
        mapped: {},
        errors: [],
        isDuplicate: false,
        needsReview: false,
        reviewReason: null,
        duplicateType: null,
        similarTitles: [],
        existingEntry: undefined,
        willImport: false,
        tmdbMatch: { status: 'no_match', result: null, confidence: 0 },
        isEmptyRow: true,
      })
      onProgress?.(index + 1, data.rows.length)
      continue
    }

    const errors = validateMappedRow(mapped, index + 1)

    const dupResult = detectDuplicate(mapped, existingEntries, existingSeasonKeys, existingTitlesLower)

    let tmdbMatch: TMDBMatchResult = { status: 'no_match', result: null, confidence: 0 }
    if (errors.length === 0 && !dupResult.isDuplicate) {
      tmdbMatch = await findMetadataMatch(mapped)
    }

    onProgress?.(index + 1, data.rows.length)

    result.push({
      rowIndex: index + 1,
      raw: row,
      mapped,
      errors,
      isDuplicate: dupResult.isDuplicate,
      needsReview: dupResult.needsReview,
      reviewReason: dupResult.reviewReason,
      duplicateType: dupResult.duplicateType,
      similarTitles: dupResult.similarTitles,
      existingEntry: dupResult.existingEntry,
      willImport: errors.length === 0 && !dupResult.isDuplicate,
      tmdbMatch,
      isEmptyRow: false,
    })
  }

  return { rows: result, ignoredEmptyRows: ignoredCount }
}
