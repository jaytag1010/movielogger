'use client'

export const dynamic = 'force-dynamic'

import { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { toast } from 'sonner'
import { AppLayout } from '@/components/layout/AppLayout'
import { ImportDropzone } from '@/components/import/ImportDropzone'
import { DryRunSummary } from '@/components/import/DryRunSummary'
import { ImportPreview } from '@/components/import/ImportPreview'
import { ImportReportView } from '@/components/import/ImportReport'
import { GlassCard } from '@/components/common/GlassCard'
import { parseImportFile, buildImportPreview } from '@/lib/import/parser'
import { fetchMovieMetadata, fetchTVMetadata, fetchSeasonMetadata, searchMulti } from '@/lib/tmdb/api'
import { batchCreateMediaEntries } from '@/lib/firebase/firestore'
import { useMedia } from '@/hooks/useMedia'
import { useAuthStore } from '@/store/authStore'
import { ImportPreviewRow, ImportReport, ImportReportRow } from '@/types/import'
import { Timestamp } from 'firebase/firestore'
import { MediaEntryInput, MediaType, MediaStatus } from '@/types/media'
import { NormalizedTMDBResult, SeasonMetadata } from '@/types/tmdb'
import { Progress } from '@/components/ui/progress'
import { getDisplayTitle } from '@/utils/formatters'

type ImportStep = 'upload' | 'parsing' | 'dryrun' | 'preview' | 'importing' | 'report'

export default function ImportPage() {
  const [step, setStep] = useState<ImportStep>('upload')
  const [previewRows, setPreviewRows] = useState<ImportPreviewRow[]>([])
  const [parseProgress, setParseProgress] = useState(0)
  const [importReport, setImportReport] = useState<ImportReport | null>(null)
  const { entries, loadEntries } = useMedia()
  const { user } = useAuthStore()

  // -------------------------------------------------------------------------
  // File parsed — run TMDB enrichment and build preview
  // -------------------------------------------------------------------------
  async function handleFileParsed(file: File) {
    setStep('parsing')
    setParseProgress(0)

    try {
      const parsed = await parseImportFile(file)
      const rows = await buildImportPreview(
        parsed,
        entries,
        (current, total) => setParseProgress(Math.round((current / total) * 100))
      )
      setPreviewRows(rows)
      // Go to dry run summary first — no data written yet
      setStep('dryrun')
    } catch (err: any) {
      toast.error(err.message || 'Failed to parse file')
      setStep('upload')
    }
  }

  // -------------------------------------------------------------------------
  // Apply authority rules to merge Excel + TMDB data
  // Authority hierarchy:
  //   Season metadata (TMDB /tv/{id}/season/{n}) > Series metadata (TMDB)
  //   > User / Excel values for personal fields (always preserved)
  // -------------------------------------------------------------------------
  async function buildEntryInput(
    row: ImportPreviewRow
  ): Promise<{ input: Omit<MediaEntryInput, 'userId'>; tmdbTitle: string | null }> {
    const mapped = row.mapped

    // ── User authority (always preserved from Excel) ──
    const userFields = {
      status: (mapped.status || 'completed') as MediaStatus,
      personalRating: mapped.personalRating ?? null,
      dateFinished: mapped.dateFinished
        ? Timestamp.fromDate(new Date(mapped.dateFinished))
        : null,
      specialNotes: mapped.specialNotes ?? null,
    }

    // ── Resolve TMDB ID ──
    // Priority: explicit tmdbId in Excel → tmdbId from search match in preview
    let resolvedTmdbId: number | null = mapped.tmdbId ?? null
    let tmdbData: NormalizedTMDBResult | null = null
    let seasonMeta: SeasonMetadata | null = null
    let tmdbTitle: string | null = null

    if (!resolvedTmdbId && row.tmdbMatch.status === 'matched' && row.tmdbMatch.result) {
      resolvedTmdbId = row.tmdbMatch.result.tmdbId
    }

    // ── Fetch full TMDB series/movie metadata ──
    if (resolvedTmdbId) {
      try {
        const type = row.tmdbMatch.result?.type === 'series' || mapped.type === 'series'
          ? 'series'
          : 'movie'
        tmdbData = type === 'movie'
          ? await fetchMovieMetadata(resolvedTmdbId)
          : await fetchTVMetadata(resolvedTmdbId)
        tmdbTitle = tmdbData.title
      } catch {
        // TMDB fetch failure is non-fatal — use what we have
      }
    }

    // ── Fetch season-specific metadata when applicable ──
    // Season metadata is TMDB-authoritative for episode count, runtime, year,
    // watch hours, and the season poster. Only relevant for series with a known season.
    const resolvedType: MediaType =
      (tmdbData?.type ?? row.tmdbMatch.result?.type ?? mapped.type ?? 'movie') as MediaType

    if (resolvedTmdbId && resolvedType === 'series' && mapped.seasonNumber) {
      try {
        seasonMeta = await fetchSeasonMetadata(resolvedTmdbId, mapped.seasonNumber)
      } catch {
        // Non-fatal — proceed with series-level data
      }
    }

    // ── Compute watch hours ──
    // Priority: season metadata (TMDB) > user-supplied Excel value
    const watchHours: number | null = (() => {
      if (seasonMeta && seasonMeta.episodeCount > 0 && seasonMeta.avgRuntime) {
        return Math.round((seasonMeta.episodeCount * seasonMeta.avgRuntime / 60) * 100) / 100
      }
      return mapped.watchHours ?? null
    })()

    // ── TMDB authority: series-level fields, overridden by season when available ──
    // Exported poster/backdrop URLs are used as a final fallback so that artwork
    // is never lost in an export → clear → re-import cycle when TMDB is unreachable.
    const tmdbFields = {
      tmdbId: resolvedTmdbId,
      seasonNumber: mapped.seasonNumber ?? null,
      // Season poster > series poster > exported poster (TMDB-unreachable fallback)
      posterUrl: seasonMeta?.posterUrl ?? tmdbData?.posterUrl ?? mapped.posterUrl ?? null,
      backdropUrl: tmdbData?.backdropUrl ?? mapped.backdropUrl ?? null,
      // Season air year takes priority over series first-air year
      yearMade: seasonMeta?.year ?? tmdbData?.year ?? mapped.yearMade ?? null,
      // Season episode count takes priority over full-series episode count
      totalEpisodes: seasonMeta?.episodeCount ?? tmdbData?.totalEpisodes ?? mapped.totalEpisodes ?? null,
      // Season avg runtime takes priority over series-level runtime
      episodeDurationMinutes: seasonMeta?.avgRuntime ?? tmdbData?.runtime ?? mapped.episodeDurationMinutes ?? null,
      // Country, age rating, genres: series-level only (season API doesn't provide these)
      country: tmdbData?.country ?? mapped.country ?? null,
      ageRating: tmdbData?.ageRating ?? mapped.ageRating ?? null,
      genres: (tmdbData?.genres && tmdbData.genres.length > 0)
        ? tmdbData.genres
        : (mapped.genres && mapped.genres.length > 0 ? mapped.genres : []),
      type: resolvedType,
    }

    // ── nextEpisodeToWatch defaults ──────────────────────────────────────────
    // Priority: explicit column in Excel → status-based default
    //   planned → 1 (start from episode 1)
    //   watching with no column → null (position unknown, show "?")
    //   completed / dropped / on_hold → null
    const nextEpisodeToWatch: number | null = (() => {
      if (mapped.nextEpisodeToWatch != null) return mapped.nextEpisodeToWatch
      if (resolvedType === 'movie') return null
      if (userFields.status === 'planned') return 1
      return null
    })()

    return {
      input: {
        title: mapped.title!,
        legacyId: mapped.legacyId ?? null,
        ...tmdbFields,
        ...userFields,
        watchHours,
        nextEpisodeToWatch,
      },
      tmdbTitle,
    }
  }

  // -------------------------------------------------------------------------
  // Confirm import
  // -------------------------------------------------------------------------
  async function handleConfirmImport(selectedRows: ImportPreviewRow[]) {
    if (!user) return
    setStep('importing')

    const inputs: Omit<MediaEntryInput, 'userId'>[] = []
    const reportRows: ImportReportRow[] = []

    // Build entries for all selected rows
    for (const row of selectedRows) {
      try {
        const { input, tmdbTitle } = await buildEntryInput(row)
        inputs.push(input)

        reportRows.push({
          rowIndex: row.rowIndex,
          title: row.mapped.title
            ? getDisplayTitle({ title: row.mapped.title, seasonNumber: row.mapped.seasonNumber })
            : '—',
          result: row.needsReview ? 'imported_reviewed' : 'imported',
          reason: tmdbTitle
            ? `Enriched with TMDB: "${tmdbTitle}"`
            : row.needsReview
            ? `Imported after review — ${row.reviewReason ?? 'flagged for review'}`
            : 'Imported from spreadsheet (no TMDB match)',
          tmdbMatch: tmdbTitle,
        })
      } catch {
        reportRows.push({
          rowIndex: row.rowIndex,
          title: row.mapped.title
            ? getDisplayTitle({ title: row.mapped.title, seasonNumber: row.mapped.seasonNumber })
            : '—',
          result: 'skipped_error',
          reason: 'Failed to build entry',
          tmdbMatch: null,
        })
      }
    }

    // Report rows for duplicates (not selected)
    const dupRows = previewRows.filter((r) => r.isDuplicate)
    for (const row of dupRows) {
      reportRows.push({
        rowIndex: row.rowIndex,
        title: row.mapped.title
          ? getDisplayTitle({ title: row.mapped.title, seasonNumber: row.mapped.seasonNumber })
          : '—',
        result: 'skipped_duplicate',
        reason: row.duplicateType === 'exact_tmdb'
          ? 'TMDB ID already in your list'
          : row.duplicateType === 'legacy'
          ? 'Title + country + year + episodes already in your list'
          : 'Title already in your list',
        tmdbMatch: null,
      })
    }

    // Report rows for errors (not selected due to validation errors)
    const errorRows = previewRows.filter((r) => r.errors.length > 0)
    for (const row of errorRows) {
      reportRows.push({
        rowIndex: row.rowIndex,
        title: row.mapped.title
          ? getDisplayTitle({ title: row.mapped.title, seasonNumber: row.mapped.seasonNumber })
          : '—',
        result: 'skipped_error',
        reason: row.errors.map((e) => e.message).join('; '),
        tmdbMatch: null,
      })
    }

    // Sort report by row index
    reportRows.sort((a, b) => a.rowIndex - b.rowIndex)

    try {
      const importedCount = inputs.length > 0
        ? await batchCreateMediaEntries(user.uid, inputs)
        : 0

      await loadEntries()

      const similarFlaggedCount = reportRows.filter((r) => r.result === 'imported_reviewed').length
      const failedCount = reportRows.filter((r) => r.result === 'skipped_error').length

      const report: ImportReport = {
        importedCount,
        duplicateCount: dupRows.length,
        similarFlaggedCount,
        failedCount,
        rows: reportRows,
        timestamp: new Date(),
      }

      setImportReport(report)
      setStep('report')

      toast.success(
        `Imported ${importedCount} entr${importedCount === 1 ? 'y' : 'ies'}` +
        (dupRows.length > 0 ? ` · ${dupRows.length} duplicate${dupRows.length === 1 ? '' : 's'} skipped` : '')
      )
    } catch (err) {
      toast.error('Import failed. Please try again.')
      setStep('preview')
    }
  }

  function handleReset() {
    setStep('upload')
    setPreviewRows([])
    setImportReport(null)
    setParseProgress(0)
  }

  return (
    <AppLayout title="Import" subtitle="Bulk import from Excel or CSV">
      <AnimatePresence mode="wait">

        {step === 'upload' && (
          <motion.div
            key="upload"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
          >
            <GlassCard padding="md">
              <ImportDropzone onFileParsed={handleFileParsed} loading={false} />
            </GlassCard>
          </motion.div>
        )}

        {step === 'parsing' && (
          <motion.div
            key="parsing"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
          >
            <GlassCard padding="md">
              <div className="py-8 text-center space-y-4">
                <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-blue-600/20 to-purple-600/20 border border-white/10 flex items-center justify-center mx-auto">
                  <div className="w-6 h-6 border-2 border-white/20 border-t-blue-500 rounded-full animate-spin" />
                </div>
                <div>
                  <p className="text-white font-medium">Reading file &amp; searching TMDB…</p>
                  <p className="text-sm text-white/40 mt-1">Matching titles for metadata enrichment</p>
                </div>
                <div className="max-w-xs mx-auto space-y-1.5">
                  <Progress value={parseProgress} className="h-1.5" />
                  <p className="text-xs text-white/30">{parseProgress}% complete</p>
                </div>
              </div>
            </GlassCard>
          </motion.div>
        )}

        {step === 'dryrun' && (
          <motion.div
            key="dryrun"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
          >
            <GlassCard padding="md">
              <DryRunSummary
                rows={previewRows}
                onReview={() => setStep('preview')}
                onReset={handleReset}
              />
            </GlassCard>
          </motion.div>
        )}

        {step === 'preview' && (
          <motion.div
            key="preview"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
          >
            <GlassCard padding="md">
              <div className="mb-4">
                <h2 className="text-base font-semibold text-white">Import Preview</h2>
                <p className="text-sm text-white/40 mt-0.5">
                  Review matches and confirm entries before importing
                </p>
              </div>
              <ImportPreview
                rows={previewRows}
                onConfirm={handleConfirmImport}
                onReset={handleReset}
                importing={false}
              />
            </GlassCard>
          </motion.div>
        )}

        {step === 'importing' && (
          <motion.div
            key="importing"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
          >
            <GlassCard padding="md">
              <div className="py-10 text-center space-y-3">
                <div className="w-14 h-14 rounded-2xl bg-emerald-500/20 flex items-center justify-center mx-auto">
                  <div className="w-6 h-6 border-2 border-emerald-400/30 border-t-emerald-400 rounded-full animate-spin" />
                </div>
                <p className="text-white font-medium">Saving to your list…</p>
                <p className="text-sm text-white/40">Writing entries to Firestore</p>
              </div>
            </GlassCard>
          </motion.div>
        )}

        {step === 'report' && importReport && (
          <motion.div
            key="report"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
          >
            <GlassCard padding="md">
              <ImportReportView
                report={importReport}
                onImportMore={handleReset}
                onViewList={() => { window.location.href = '/my-list' }}
              />
            </GlassCard>
          </motion.div>
        )}

      </AnimatePresence>
    </AppLayout>
  )
}
