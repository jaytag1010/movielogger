import * as XLSX from 'xlsx'
import Papa from 'papaparse'
import { MediaEntry } from '@/types/media'
import { Timestamp } from 'firebase/firestore'

function formatTimestamp(ts: Timestamp | null | undefined): string {
  if (!ts) return ''
  return ts.toDate().toISOString().split('T')[0]
}

function entryToRow(entry: MediaEntry) {
  return {
    // ── Identity ──────────────────────────────────────────────────────────
    // 'ID Number' re-imports as legacyId so the old ML-XXXXXX is preserved
    // as a reference even after internalId is regenerated.
    'ID Number': entry.internalId,
    'Legacy ID': entry.legacyId ?? '',
    'TMDB ID': entry.tmdbId ?? '',
    // ── Core metadata ─────────────────────────────────────────────────────
    Title: entry.title,
    Type: entry.type,
    // Season Number is critical for round-trip safety: without it, every
    // season-tracked series would re-import as a full-series entry.
    'Season Number': entry.seasonNumber ?? '',
    // Next Episode preserves in-progress tracking across export → re-import cycles.
    'Next Episode': entry.nextEpisodeToWatch ?? '',
    Status: entry.status,
    'Year Made': entry.yearMade ?? '',
    'Total Episodes': entry.totalEpisodes ?? '',
    'Episode Duration': entry.episodeDurationMinutes ?? '',
    // ── User-owned fields (never overwritten by TMDB on re-import) ─────────
    'Watch Hours': entry.watchHours ?? '',
    'Personal Rating': entry.personalRating ?? '',
    'Date Finished': formatTimestamp(entry.dateFinished),
    'Special Notes': entry.specialNotes ?? '',
    // ── TMDB-sourced metadata (re-fetched on re-import; exported as fallback)
    'Age Rating': entry.ageRating ?? '',
    Genres: entry.genres?.join(', ') ?? '',
    Country: entry.country ?? '',
    'Poster URL': entry.posterUrl ?? '',
    'Backdrop URL': entry.backdropUrl ?? '',
    // ── Audit ─────────────────────────────────────────────────────────────
    'Created At': formatTimestamp(entry.createdAt),
  }
}

export function exportToExcel(entries: MediaEntry[], filename = 'movielogger_export'): void {
  const rows = entries.map(entryToRow)
  const worksheet = XLSX.utils.json_to_sheet(rows)
  const workbook = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(workbook, worksheet, 'MovieLogger')

  const colWidths = [
    { wch: 12 }, // ID Number
    { wch: 12 }, // Legacy ID
    { wch: 10 }, // TMDB ID
    { wch: 40 }, // Title
    { wch: 10 }, // Type
    { wch: 14 }, // Season Number
    { wch: 14 }, // Next Episode
    { wch: 12 }, // Status
    { wch: 10 }, // Year Made
    { wch: 14 }, // Total Episodes
    { wch: 16 }, // Episode Duration
    { wch: 12 }, // Watch Hours
    { wch: 14 }, // Personal Rating
    { wch: 14 }, // Date Finished
    { wch: 50 }, // Special Notes
    { wch: 12 }, // Age Rating
    { wch: 30 }, // Genres
    { wch: 20 }, // Country
    { wch: 60 }, // Poster URL
    { wch: 60 }, // Backdrop URL
    { wch: 20 }, // Created At
  ]
  worksheet['!cols'] = colWidths

  XLSX.writeFile(workbook, `${filename}.xlsx`)
}

export function exportToCSV(entries: MediaEntry[], filename = 'movielogger_export'): void {
  const rows = entries.map(entryToRow)
  const csv = Papa.unparse(rows)
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = `${filename}.csv`
  link.click()
  URL.revokeObjectURL(url)
}
