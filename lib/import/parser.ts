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
import { searchMultiNormalized } from '@/lib/tmdb/api'
import { NormalizedTMDBResult } from '@/types/tmdb'
import { normalizeCountry } from '@/utils/countries'

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
// TMDB enrichment
// ---------------------------------------------------------------------------

/**
 * Search TMDB for the best match for a row that has no tmdbId.
 * Returns matched result + confidence score (0–1).
 */
async function findTMDBMatch(mapped: MappedRow): Promise<TMDBMatchResult> {
  if (!mapped.title) return { status: 'no_match', result: null, confidence: 0 }

  // Row already has an explicit tmdbId — treat as a confident match so it goes to the Matched screen.
  // Full metadata is fetched later in buildEntryInput; we build a minimal NormalizedTMDBResult here.
  if (mapped.tmdbId) {
    const syntheticResult: NormalizedTMDBResult = {
      tmdbId: mapped.tmdbId,
      title: mapped.title,
      type: (mapped.type === 'series' ? 'series' : 'movie') as 'movie' | 'series',
      year: mapped.yearMade ?? null,
      posterUrl: mapped.posterUrl ?? null,
      backdropUrl: mapped.backdropUrl ?? null,
      genres: mapped.genres ?? [],
      country: mapped.country ?? null,
      runtime: mapped.episodeDurationMinutes ?? null,
      totalEpisodes: mapped.totalEpisodes ?? null,
      ageRating: mapped.ageRating ?? null,
      overview: '',
    }
    return { status: 'matched', result: syntheticResult, confidence: 1.0 }
  }

  try {
    const allResults = await searchMultiNormalized(mapped.title)

    if (allResults.length === 0) return { status: 'no_match', result: null, confidence: 0 }

    // ── Series signals from the source row ──────────────────────────────
    // These are strong indicators that the entry should be a TV series, regardless
    // of what the spreadsheet's Type column says (which is often wrong).
    const rowHasEpisodes = (mapped.totalEpisodes ?? 0) > 1
    const rowHasSeason = mapped.seasonNumber != null && mapped.seasonNumber >= 1

    // Normalise the row's country for comparison (handles "TH" vs "Thailand")
    const rowCountryNorm = normalizeCountry(mapped.country)?.toLowerCase() ?? null

    const titleNorm = mapped.title.toLowerCase().trim()
    const scored = allResults.map((r) => {
      let score = 0
      const rTitleNorm = r.title.toLowerCase().trim()

      // ── Title similarity (primary signal, 0.60 max) ──────────────────────
      if (rTitleNorm === titleNorm) {
        score += 0.60
      } else if (rTitleNorm.includes(titleNorm) || titleNorm.includes(rTitleNorm)) {
        score += 0.30
      }

      // ── Year match (+0.20) ────────────────────────────────────────────────
      if (mapped.yearMade && r.year && mapped.yearMade === r.year) score += 0.20

      // ── Series structural signals (+0.20 max, overrides type column bias) ─
      // Episode count > 1 or explicit season number are definitive proof of a series.
      if (r.type === 'series') {
        if (rowHasEpisodes) score += 0.15
        if (rowHasSeason)   score += 0.15
      } else {
        // Penalise movie result when row has clear series signals
        if (rowHasEpisodes) score -= 0.15
        if (rowHasSeason)   score -= 0.15
      }

      // ── Type column match (+0.05, reduced from 0.10) ──────────────────────
      // Kept at low weight because spreadsheets frequently misclassify series as movies.
      // Series structural signals above take precedence.
      if (mapped.type && r.type === mapped.type) score += 0.05

      // ── Country match (+0.10) ─────────────────────────────────────────────
      // Both sides normalised: ISO codes ("TH") → full names ("Thailand")
      if (rowCountryNorm && r.country) {
        const rCountryNorm = normalizeCountry(r.country)?.toLowerCase() ?? r.country.toLowerCase()
        if (rowCountryNorm === rCountryNorm) score += 0.10
      }

      return { result: r, score }
    })

    scored.sort((a, b) => b.score - a.score)
    const best = scored[0]

    // Only return a match if confidence is reasonably high
    if (best.score >= 0.55) {
      return { status: 'matched', result: best.result, confidence: Math.min(best.score, 1) }
    }

    return { status: 'no_match', result: null, confidence: best.score }
  } catch {
    // TMDB search failure is non-fatal — proceed without enrichment
    return { status: 'no_match', result: null, confidence: 0 }
  }
}

// ---------------------------------------------------------------------------
// Main preview builder
// ---------------------------------------------------------------------------

function isRowCompletelyEmpty(row: ImportRow): boolean {
  return Object.values(row).every(
    (v) => v === null || v === undefined || String(v).trim() === ''
  )
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
    const errors = validateMappedRow(mapped, index + 1)

    const dupResult = detectDuplicate(mapped, existingEntries, existingSeasonKeys, existingTitlesLower)

    let tmdbMatch: TMDBMatchResult = { status: 'no_match', result: null, confidence: 0 }
    if (errors.length === 0 && !dupResult.isDuplicate) {
      tmdbMatch = await findTMDBMatch(mapped)
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
