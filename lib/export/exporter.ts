import * as XLSX from 'xlsx'
import Papa from 'papaparse'
import { MediaEntry } from '@/types/media'
import { Timestamp } from 'firebase/firestore'
import { calculateEntryWatchHours, calculateTotalWatchHours } from '@/utils/watchTime'
import { getEffectiveMediaType } from '@/utils/formatters'

function formatTimestamp(ts: Timestamp | null | undefined): string {
  if (!ts) return ''
  return ts.toDate().toISOString().split('T')[0]
}

function entryToRow(entry: MediaEntry) {
  return {
    // Identity
    // 'ID Number' re-imports as legacyId so the old ML-XXXXXX is preserved
    // as a reference even after internalId is regenerated.
    'ID Number': entry.internalId,
    'Legacy ID': entry.legacyId ?? '',
    'TMDB ID': entry.tmdbId ?? '',
    // Core metadata
    Title: entry.title,
    Type: entry.type,
    // Season Number is critical for round-trip safety.
    'Season Number': entry.seasonNumber ?? '',
    // Next Episode preserves progress across export -> re-import cycles.
    'Next Episode': entry.nextEpisodeToWatch ?? '',
    Status: entry.status,
    'Year Made': entry.yearMade ?? '',
    'Total Episodes': entry.totalEpisodes ?? '',
    'Episode Duration': entry.episodeDurationMinutes ?? '',
    'Episode Average Duration': entry.episodeDurationMinutes ?? '',
    // User-owned fields
    'Watch Hours': entry.watchHours ?? '',
    'Personal Rating': entry.personalRating ?? '',
    'Date Finished': formatTimestamp(entry.dateFinished),
    'Special Notes': entry.specialNotes ?? '',
    // TMDB/import metadata
    'Age Rating': entry.ageRating ?? '',
    Genres: entry.genres?.join(', ') ?? '',
    Country: entry.country ?? '',
    'Poster URL': entry.posterUrl ?? '',
    'Backdrop URL': entry.backdropUrl ?? '',
    // Audit
    'Created At': formatTimestamp(entry.createdAt),
  }
}

type ExportRow = ReturnType<typeof entryToRow>

const MAIN_HEADERS: (keyof ExportRow)[] = [
  'ID Number',
  'Legacy ID',
  'TMDB ID',
  'Title',
  'Type',
  'Season Number',
  'Next Episode',
  'Status',
  'Year Made',
  'Total Episodes',
  'Episode Duration',
  'Episode Average Duration',
  'Watch Hours',
  'Personal Rating',
  'Date Finished',
  'Special Notes',
  'Age Rating',
  'Genres',
  'Country',
  'Poster URL',
  'Backdrop URL',
  'Created At',
]

function topValues(
  entries: MediaEntry[],
  getValues: (entry: MediaEntry) => string[] | string | null | undefined,
  limit = 8
): string {
  const counts = new Map<string, number>()
  for (const entry of entries) {
    const raw = getValues(entry)
    const values = Array.isArray(raw) ? raw : raw ? [raw] : []
    for (const value of values) {
      const key = value.trim()
      if (!key) continue
      counts.set(key, (counts.get(key) ?? 0) + 1)
    }
  }

  return Array.from(counts.entries())
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, limit)
    .map(([label, count]) => `${label} (${count})`)
    .join(', ')
}

function buildSummaryRows(entries: MediaEntry[]) {
  const movies = entries.filter((e) => getEffectiveMediaType(e) === 'movie')
  const series = entries.filter((e) => getEffectiveMediaType(e) === 'series')
  const rated = entries.filter((e) => e.personalRating != null)
  const avgRating = rated.length > 0
    ? rated.reduce((sum, e) => sum + (e.personalRating ?? 0), 0) / rated.length
    : null

  return [
    { Metric: 'Export Date', Value: new Date().toLocaleString() },
    { Metric: 'Total Titles', Value: entries.length },
    { Metric: 'Total Movies', Value: movies.length },
    { Metric: 'Total Series', Value: series.length },
    { Metric: 'Average Rating', Value: avgRating == null ? '' : Number(avgRating.toFixed(2)) },
    { Metric: 'Total Watch Hours', Value: Number(calculateTotalWatchHours(entries).toFixed(2)) },
    { Metric: 'Top Countries', Value: topValues(entries, (e) => e.country) },
    { Metric: 'Top Genres', Value: topValues(entries, (e) => e.genres) },
  ]
}

function styleWorksheet(
  worksheet: XLSX.WorkSheet,
  rows: Record<string, unknown>[],
  headers: string[],
  columnWidths: { wch: number }[]
) {
  const range = XLSX.utils.decode_range(worksheet['!ref'] ?? 'A1:A1')
  const lastColumn = XLSX.utils.encode_col(headers.length - 1)

  worksheet['!cols'] = columnWidths
  worksheet['!autofilter'] = { ref: `A1:${lastColumn}${Math.max(rows.length + 1, 1)}` }
  worksheet['!freeze'] = { xSplit: 0, ySplit: 1 }
  worksheet['!rows'] = [
    { hpt: 24 },
    ...rows.map((row) => {
      const title = String(row.Title ?? '')
      const notes = String(row['Special Notes'] ?? '')
      return { hpt: title.length > 48 || notes.length > 80 ? 42 : 22 }
    }),
  ]

  for (let col = range.s.c; col <= range.e.c; col++) {
    const headerCell = worksheet[XLSX.utils.encode_cell({ r: 0, c: col })]
    if (!headerCell) continue
    headerCell.s = {
      font: { bold: true, color: { rgb: 'FFFFFF' } },
      fill: { fgColor: { rgb: '1E3A8A' } },
      alignment: { horizontal: 'center', vertical: 'center', wrapText: true },
    }
  }

  for (let row = 1; row <= range.e.r; row++) {
    const isAlt = row % 2 === 0
    for (let col = range.s.c; col <= range.e.c; col++) {
      const cell = worksheet[XLSX.utils.encode_cell({ r: row, c: col })]
      if (!cell) continue
      cell.s = {
        fill: isAlt ? { fgColor: { rgb: 'F8FAFC' } } : undefined,
        alignment: {
          vertical: 'top',
          wrapText: headers[col] === 'Title' || headers[col] === 'Special Notes',
        },
      }
    }
  }
}

function addMainSheet(workbook: XLSX.WorkBook, rows: ExportRow[]) {
  const worksheet = XLSX.utils.json_to_sheet(rows, { header: MAIN_HEADERS as string[] })

  const colWidths = [
    { wch: 12 }, // ID Number
    { wch: 12 }, // Legacy ID
    { wch: 10 }, // TMDB ID
    { wch: 32 }, // Title
    { wch: 10 }, // Type
    { wch: 14 }, // Season Number
    { wch: 14 }, // Next Episode
    { wch: 12 }, // Status
    { wch: 10 }, // Year Made
    { wch: 14 }, // Total Episodes
    { wch: 16 }, // Episode Duration
    { wch: 22 }, // Episode Average Duration
    { wch: 12 }, // Watch Hours
    { wch: 14 }, // Personal Rating
    { wch: 14 }, // Date Finished
    { wch: 42 }, // Special Notes
    { wch: 12 }, // Age Rating
    { wch: 28 }, // Genres
    { wch: 20 }, // Country
    { wch: 48 }, // Poster URL
    { wch: 48 }, // Backdrop URL
    { wch: 20 }, // Created At
  ]

  styleWorksheet(worksheet, rows, MAIN_HEADERS as string[], colWidths)
  XLSX.utils.book_append_sheet(workbook, worksheet, 'MovieLogger')
}

function addSummarySheet(workbook: XLSX.WorkBook, entries: MediaEntry[]) {
  const rows = buildSummaryRows(entries)
  const worksheet = XLSX.utils.json_to_sheet(rows, { header: ['Metric', 'Value'] })
  styleWorksheet(worksheet, rows, ['Metric', 'Value'], [{ wch: 24 }, { wch: 72 }])
  XLSX.utils.book_append_sheet(workbook, worksheet, 'MovieLogger Summary')
}

function assertExportCompleteness(entries: MediaEntry[], rows: ExportRow[]) {
  const nonEmptyTitleRows = rows.filter((row) => String(row.Title ?? '').trim() !== '').length
  if (nonEmptyTitleRows !== entries.length) {
    throw new Error(
      `Export integrity check failed: expected ${entries.length} title rows, got ${nonEmptyTitleRows}`
    )
  }
}

export function exportToExcel(entries: MediaEntry[], filename = 'movielogger_export'): void {
  const rows = entries.map(entryToRow)
  assertExportCompleteness(entries, rows)

  const workbook = XLSX.utils.book_new()
  addMainSheet(workbook, rows)
  addSummarySheet(workbook, entries)

  XLSX.writeFile(workbook, `${filename}.xlsx`, { cellStyles: true })
}

export function exportToCSV(entries: MediaEntry[], filename = 'movielogger_export'): void {
  const rows = entries.map(entryToRow)
  assertExportCompleteness(entries, rows)

  const csv = Papa.unparse(rows, { columns: MAIN_HEADERS as string[] })
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = `${filename}.csv`
  link.click()
  URL.revokeObjectURL(url)
}
