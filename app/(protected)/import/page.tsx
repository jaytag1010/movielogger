'use client'

export const dynamic = 'force-dynamic'

import { useState, useRef } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { toast } from 'sonner'
import { AppLayout } from '@/components/layout/AppLayout'
import { ImportDropzone } from '@/components/import/ImportDropzone'
import { ImportSummary } from '@/components/import/ImportSummary'
import { MatchedTitlesView } from '@/components/import/MatchedTitlesView'
import { ManualReviewView } from '@/components/import/ManualReviewView'
import { DuplicatesView } from '@/components/import/DuplicatesView'
import { ImportReportView } from '@/components/import/ImportReport'
import { GlassCard } from '@/components/common/GlassCard'
import { parseImportFile, buildImportPreview } from '@/lib/import/parser'
import { fetchMovieMetadata, fetchTVMetadata, fetchSeasonMetadata } from '@/lib/tmdb/api'
import { batchCreateMediaEntries } from '@/lib/firebase/firestore'
import { useMedia } from '@/hooks/useMedia'
import { useAuthStore } from '@/store/authStore'
import {
  ImportPreviewRow,
  ImportReport,
  ImportReportRow,
  ReviewCardEdits,
} from '@/types/import'
import { Timestamp } from 'firebase/firestore'
import { MediaEntryInput, MediaType, MediaStatus } from '@/types/media'
import { NormalizedTMDBResult, SeasonMetadata } from '@/types/tmdb'
import { Progress } from '@/components/ui/progress'
import { getDisplayTitle } from '@/utils/formatters'
import { parseEpisodeDurationRange } from '@/utils/episodeDuration'

type ImportStep =
  | 'upload'
  | 'parsing'
  | 'summary'
  | 'matched'
  | 'review'
  | 'duplicates'
  | 'report'

export default function ImportPage() {
  const [step, setStep] = useState<ImportStep>('upload')
  const [parseProgress, setParseProgress] = useState(0)

  const [allRows, setAllRows] = useState<ImportPreviewRow[]>([])
  const [ignoredEmptyRows, setIgnoredEmptyRows] = useState(0)

  const [matchedRows, setMatchedRows] = useState<ImportPreviewRow[]>([])
  const [reviewRows, setReviewRows] = useState<ImportPreviewRow[]>([])
  const [duplicateRows, setDuplicateRows] = useState<ImportPreviewRow[]>([])
  const [errorRows, setErrorRows] = useState<ImportPreviewRow[]>([])

  const [reviewQueue, setReviewQueue] = useState<ImportPreviewRow[]>([])
  const [reviewEdits, setReviewEdits] = useState<Record<number, ReviewCardEdits>>({})
  const [reviewTmdbLinks, setReviewTmdbLinks] = useState<Record<number, NormalizedTMDBResult>>({})

  const [matchedLoading, setMatchedLoading] = useState(false)
  const [reviewLoading, setReviewLoading] = useState(false)
  const [reviewLoadingRowIndex, setReviewLoadingRowIndex] = useState<number | null>(null)

  // Progress shown in the triggering button. phase 'building' = preparing entries
  // (TMDB fetches); phase 'saving' = writing to Firestore.
  type BtnProgress = { current: number; total: number; phase: 'building' | 'saving' }
  const [matchedProgress, setMatchedProgress] = useState<BtnProgress | null>(null)
  const [reviewProgress, setReviewProgress] = useState<BtnProgress | null>(null)


  const [importReport, setImportReport] = useState<ImportReport | null>(null)

  // Refs accumulate counts across steps; never cause stale-closure issues.
  const accImportedCount = useRef(0)
  const accImportedIndexes = useRef<Set<number>>(new Set())

  const { entries, loadEntries } = useMedia()
  const { user } = useAuthStore()

  // ---------------------------------------------------------------------------
  // TMDB metadata + entry building
  // ---------------------------------------------------------------------------
  async function buildEntryInput(
    row: ImportPreviewRow,
    edits?: ReviewCardEdits,
    tmdbLink?: NormalizedTMDBResult
  ): Promise<{ input: Omit<MediaEntryInput, 'userId'>; tmdbTitle: string | null }> {
    const mapped = row.mapped

    const userFields = {
      status: ((edits?.status ?? mapped.status) || 'completed') as MediaStatus,
      personalRating: edits?.personalRating ?? mapped.personalRating ?? null,
      dateFinished: mapped.dateFinished
        ? Timestamp.fromDate(new Date(mapped.dateFinished))
        : null,
      specialNotes: edits?.specialNotes ?? mapped.specialNotes ?? null,
    }

    const effectiveTmdbMatch = tmdbLink ?? row.tmdbMatch.result
    let resolvedTmdbId: number | null = mapped.tmdbId ?? null
    if (!resolvedTmdbId && effectiveTmdbMatch) {
      resolvedTmdbId = effectiveTmdbMatch.tmdbId
    }

    let tmdbData: NormalizedTMDBResult | null = null
    let seasonMeta: SeasonMetadata | null = null
    let tmdbTitle: string | null = null

    if (resolvedTmdbId) {
      try {
        const matchType = effectiveTmdbMatch?.type
        const type =
          matchType === 'series' ||
          (edits?.type ?? mapped.type ?? row.existingEntry?.type) === 'series'
            ? 'series'
            : 'movie'
        tmdbData = type === 'movie'
          ? await fetchMovieMetadata(resolvedTmdbId)
          : await fetchTVMetadata(resolvedTmdbId)
        tmdbTitle = tmdbData.title
      } catch {
        // Non-fatal — use what we have
      }
    }

    // Classification authority: TMDB type > explicit type column > episode count > default 'movie'
    const explicitType = edits?.type ?? tmdbData?.type ?? effectiveTmdbMatch?.type ?? mapped.type
    const episodeBasedType: MediaType | null =
      (mapped.totalEpisodes != null && mapped.totalEpisodes > 1) ? 'series' : null
    const resolvedType: MediaType = (explicitType ?? episodeBasedType ?? 'movie') as MediaType

    if (resolvedTmdbId && resolvedType === 'series' && mapped.seasonNumber) {
      try {
        seasonMeta = await fetchSeasonMetadata(resolvedTmdbId, mapped.seasonNumber)
      } catch {
        // Non-fatal
      }
    }

    // ── Episode duration: TMDB > episodeAverageDuration > parsed range > null ──
    const avgDuration = edits?.episodeDurationMinutes ?? mapped.episodeAverageDuration ?? null
    const parsedRange = parseEpisodeDurationRange(mapped.episodeDurationMinutes)
    const importedDuration = avgDuration ?? parsedRange ?? null
    const episodeDurationMinutes: number | null =
      seasonMeta?.avgRuntime ?? tmdbData?.runtime ?? importedDuration ?? null

    // ── Total episodes ──
    const totalEpisodes: number | null =
      seasonMeta?.episodeCount ?? tmdbData?.totalEpisodes ?? (edits?.totalEpisodes ?? mapped.totalEpisodes) ?? null

    // ── Watch hours ──
    // Series: always calculated (never user-overridable)
    // Movies: TMDB runtime > imported duration > spreadsheet Watch Hour > null
    const round2 = (n: number) => Math.round(n * 100) / 100
    const watchHours: number | null = (() => {
      if (resolvedType === 'series' || (totalEpisodes != null && totalEpisodes > 1)) {
        // Series — always derived from episodes × duration
        if (seasonMeta && seasonMeta.episodeCount > 0 && seasonMeta.avgRuntime) {
          return round2(seasonMeta.episodeCount * seasonMeta.avgRuntime / 60)
        }
        if (totalEpisodes != null && totalEpisodes > 1 && episodeDurationMinutes) {
          return round2(totalEpisodes * episodeDurationMinutes / 60)
        }
        // Series with no calculable data — fall through to spreadsheet
        return mapped.watchHours ?? null
      }
      // Movie / single-episode
      const movieRuntime = tmdbData?.runtime ?? importedDuration
      if (movieRuntime) return round2(movieRuntime / 60)
      return edits?.watchHours ?? mapped.watchHours ?? null
    })()

    const tmdbFields = {
      tmdbId: resolvedTmdbId,
      seasonNumber: mapped.seasonNumber ?? null,
      posterUrl: seasonMeta?.posterUrl ?? tmdbData?.posterUrl ?? mapped.posterUrl ?? null,
      backdropUrl: tmdbData?.backdropUrl ?? mapped.backdropUrl ?? null,
      yearMade: seasonMeta?.year ?? tmdbData?.year ?? (edits?.yearMade ?? mapped.yearMade) ?? null,
      totalEpisodes,
      episodeDurationMinutes,
      country: tmdbData?.country ?? (edits?.country ?? mapped.country) ?? null,
      ageRating: tmdbData?.ageRating ?? (edits?.ageRating ?? mapped.ageRating) ?? null,
      genres: (tmdbData?.genres && tmdbData.genres.length > 0)
        ? tmdbData.genres
        : ((edits?.genres && edits.genres.length > 0) ? edits.genres : (mapped.genres && mapped.genres.length > 0 ? mapped.genres : [])),
      type: resolvedType,
    }

    // "Episodes Watched" (stored in nextEpisodeToWatch). Hidden for completed;
    // otherwise the imported value or 0. Applies to movies and series.
    const nextEpisodeToWatch: number | null = (() => {
      if (userFields.status === 'completed') return null
      if (mapped.nextEpisodeToWatch != null) return mapped.nextEpisodeToWatch
      return 0
    })()

    const mergedTitle = edits?.title || mapped.title || null
    if (!mergedTitle) {
      throw new Error(`Row ${row.rowIndex}: title is required but missing`)
    }

    return {
      input: {
        title: mergedTitle,
        legacyId: mapped.legacyId ?? null,
        manualPosterUrl: null,
        ...tmdbFields,
        ...userFields,
        watchHours,
        nextEpisodeToWatch,
      },
      tmdbTitle,
    }
  }

  // ---------------------------------------------------------------------------
  // Write helper — runs batchCreateMediaEntries.
  // Progress is shown in the triggering button (build phase), not a separate
  // overlay screen, so no progress state is set here.
  // ---------------------------------------------------------------------------
  async function writeToFirestore(
    inputs: Omit<MediaEntryInput, 'userId'>[],
    rowIndexes: number[],
    onProgress?: (current: number, total: number) => void
  ): Promise<number> {
    if (!user) throw new Error('Not authenticated')
    const count = await batchCreateMediaEntries(user.uid, inputs, onProgress)
    // Accumulate into refs so buildAndSetReport always reads fresh totals
    accImportedCount.current += count
    rowIndexes.forEach((idx) => accImportedIndexes.current.add(idx))
    return count
  }

  // ---------------------------------------------------------------------------
  // Finalise: build report, navigate, refresh store in background
  // ---------------------------------------------------------------------------
  function finalizeImport() {
    buildAndSetReport()
    setStep('report')
    // Non-blocking: refresh My List store so "Go to My List" shows new entries
    loadEntries().catch(() => {})
  }

  // ---------------------------------------------------------------------------
  // Step: file parsed
  // ---------------------------------------------------------------------------
  async function handleFileParsed(file: File) {
    setStep('parsing')
    setParseProgress(0)

    try {
      const parsed = await parseImportFile(file)
      const { rows, ignoredEmptyRows: emptyCount } = await buildImportPreview(
        parsed,
        entries,
        (current, total) => setParseProgress(Math.round((current / total) * 100))
      )

      const matched = rows.filter(
        (r) => r.tmdbMatch.status === 'matched' && r.errors.length === 0 && !r.isDuplicate
      )
      const review = rows.filter(
        (r) => r.errors.length === 0 && !r.isDuplicate && !r.isEmptyRow && r.tmdbMatch.status === 'no_match'
      )
      const duplicates = rows.filter((r) => r.isDuplicate)
      const errors = rows.filter((r) => r.errors.length > 0 && !r.isEmptyRow)

      setAllRows(rows)
      setIgnoredEmptyRows(emptyCount)
      setMatchedRows(matched)
      setReviewRows(review)
      setReviewQueue(review)
      setDuplicateRows(duplicates)
      setErrorRows(errors)
      setReviewEdits({})
      setReviewTmdbLinks({})
      accImportedCount.current = 0
      accImportedIndexes.current = new Set()
      setStep('summary')
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Failed to parse file'
      toast.error(message)
      setStep('upload')
    }
  }

  // ---------------------------------------------------------------------------
  // Summary → next step
  // ---------------------------------------------------------------------------
  function handleSummaryContinue() {
    if (matchedRows.length > 0) setStep('matched')
    else if (reviewRows.length > 0) setStep('review')
    else if (duplicateRows.length > 0) setStep('duplicates')
    else finalizeImport()
  }

  // ---------------------------------------------------------------------------
  // Matched screen: "Add All N Titles"
  // Build entries (progress shown in button) then write to Firestore.
  // The button stays in its loading state through both phases.
  // ---------------------------------------------------------------------------
  async function handleImportMatched() {
    setMatchedLoading(true)
    setMatchedProgress({ current: 0, total: matchedRows.length, phase: 'building' })

    const inputs: Omit<MediaEntryInput, 'userId'>[] = []
    const rowIndexes: number[] = []

    try {
      for (const row of matchedRows) {
        const { input } = await buildEntryInput(row)
        inputs.push(input)
        rowIndexes.push(row.rowIndex)
        setMatchedProgress({ current: inputs.length, total: matchedRows.length, phase: 'building' })
      }
      setMatchedProgress({ current: 0, total: inputs.length, phase: 'saving' })
      await writeToFirestore(inputs, rowIndexes, (current, total) =>
        setMatchedProgress({ current, total, phase: 'saving' })
      )
    } catch {
      toast.error('Import failed. Please try again.')
      return
    } finally {
      setMatchedLoading(false)
      setMatchedProgress(null)
    }

    if (reviewQueue.length > 0) setStep('review')
    else if (duplicateRows.length > 0) setStep('duplicates')
    else finalizeImport()
  }

  // ---------------------------------------------------------------------------
  // Review card: save edits
  // ---------------------------------------------------------------------------
  function handleSaveEdits(rowIndex: number, edits: ReviewCardEdits) {
    setReviewEdits((prev) => ({ ...prev, [rowIndex]: edits }))
  }

  function handleLinkTMDB(rowIndex: number, result: NormalizedTMDBResult) {
    setReviewTmdbLinks((prev) => ({ ...prev, [rowIndex]: result }))
  }

  // ---------------------------------------------------------------------------
  // Review card: "Add to List" (single entry — writes immediately)
  // ---------------------------------------------------------------------------
  async function handleAddOne(rowIndex: number, immediateEdits?: ReviewCardEdits) {
    const row = reviewQueue.find((r) => r.rowIndex === rowIndex)
    if (!row) return
    setReviewLoadingRowIndex(rowIndex)
    try {
      // Prefer immediateEdits passed directly from the card's "Add to List"
      // button — reviewEdits[rowIndex] may be stale due to React's batched
      // state updates not flushing between onSaveEdits and onAddOne.
      const edits = immediateEdits ?? reviewEdits[rowIndex]
      const tmdbLink = reviewTmdbLinks[rowIndex]
      const { input } = await buildEntryInput(row, edits, tmdbLink)
      await writeToFirestore([input], [rowIndex])
      setReviewQueue((prev) => prev.filter((r) => r.rowIndex !== rowIndex))
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to import entry')
    } finally {
      setReviewLoadingRowIndex(null)
    }
  }

  // ---------------------------------------------------------------------------
  // Review screen: "Add Remaining N to List"
  // Build entries (progress shown in button) then write to Firestore.
  // The button stays in its loading state through both phases.
  // ---------------------------------------------------------------------------
  async function handleAddRemaining() {
    setReviewLoading(true)
    setReviewProgress({ current: 0, total: reviewQueue.length, phase: 'building' })

    const inputs: Omit<MediaEntryInput, 'userId'>[] = []
    const rowIndexes: number[] = []

    try {
      for (const row of reviewQueue) {
        const edits = reviewEdits[row.rowIndex]
        const tmdbLink = reviewTmdbLinks[row.rowIndex]
        const { input } = await buildEntryInput(row, edits, tmdbLink)
        inputs.push(input)
        rowIndexes.push(row.rowIndex)
        setReviewProgress({ current: inputs.length, total: reviewQueue.length, phase: 'building' })
      }
      setReviewProgress({ current: 0, total: inputs.length, phase: 'saving' })
      await writeToFirestore(inputs, rowIndexes, (current, total) =>
        setReviewProgress({ current, total, phase: 'saving' })
      )
    } catch {
      toast.error('Import failed. Please try again.')
      return
    } finally {
      setReviewLoading(false)
      setReviewProgress(null)
    }

    setReviewQueue([])
    if (duplicateRows.length > 0) setStep('duplicates')
    else finalizeImport()
  }

  // ---------------------------------------------------------------------------
  // Review screen: "Don't Add Remaining"
  // ---------------------------------------------------------------------------
  function handleSkipRemaining() {
    setReviewQueue([])
    if (duplicateRows.length > 0) setStep('duplicates')
    else finalizeImport()
  }

  // ---------------------------------------------------------------------------
  // Duplicates screen
  // ---------------------------------------------------------------------------
  async function handleDuplicatesDecision(importThem: boolean) {
    if (!importThem) {
      finalizeImport()
      return
    }

    const inputs: Omit<MediaEntryInput, 'userId'>[] = []
    const rowIndexes: number[] = []

    for (const row of duplicateRows) {
      try {
        const { input } = await buildEntryInput(row)
        inputs.push(input)
        rowIndexes.push(row.rowIndex)
      } catch {
        // Skip rows that fail to build
      }
    }

    try {
      await writeToFirestore(inputs, rowIndexes)
    } catch {
      toast.error('Import failed. Please try again.')
      return
    }

    finalizeImport()
  }

  // ---------------------------------------------------------------------------
  // Report construction — reads from refs, no stale-closure risk
  // ---------------------------------------------------------------------------
  function buildAndSetReport() {
    const importedCount = accImportedCount.current
    const importedIndexes = accImportedIndexes.current

    const rows: ImportReportRow[] = []

    for (const row of matchedRows) {
      const wasImported = importedIndexes.has(row.rowIndex)
      rows.push({
        rowIndex: row.rowIndex,
        title: getDisplayTitle({ title: row.mapped.title!, seasonNumber: row.mapped.seasonNumber }),
        result: wasImported ? 'imported' : 'skipped_review',
        reason: wasImported
          ? row.tmdbMatch.result ? `TMDB: "${row.tmdbMatch.result.title}"` : 'Imported from spreadsheet'
          : 'Not imported',
        tmdbMatch: row.tmdbMatch.result?.title ?? null,
      })
    }

    for (const row of reviewRows) {
      const wasImported = importedIndexes.has(row.rowIndex)
      rows.push({
        rowIndex: row.rowIndex,
        title: getDisplayTitle({ title: row.mapped.title!, seasonNumber: row.mapped.seasonNumber }),
        result: wasImported ? 'imported_reviewed' : 'skipped_review',
        reason: wasImported ? 'Imported after manual review' : 'Skipped during review',
        tmdbMatch: reviewTmdbLinks[row.rowIndex]?.title ?? null,
      })
    }

    for (const row of duplicateRows) {
      const wasImported = importedIndexes.has(row.rowIndex)
      rows.push({
        rowIndex: row.rowIndex,
        title: getDisplayTitle({ title: row.mapped.title!, seasonNumber: row.mapped.seasonNumber }),
        result: wasImported ? 'imported' : 'skipped_duplicate',
        reason: wasImported ? 'Imported (duplicate overridden by user)' : 'Already in library',
        tmdbMatch: null,
      })
    }

    for (const row of errorRows) {
      rows.push({
        rowIndex: row.rowIndex,
        title: row.mapped.title
          ? getDisplayTitle({ title: row.mapped.title, seasonNumber: row.mapped.seasonNumber })
          : '—',
        result: 'skipped_error',
        reason: row.errors.map((e) => e.message).join('; '),
        tmdbMatch: null,
      })
    }

    rows.sort((a, b) => a.rowIndex - b.rowIndex)

    const duplicatesImportedCount = duplicateRows.filter((r) => importedIndexes.has(r.rowIndex)).length
    const matchedImportedCount = matchedRows.filter((r) => importedIndexes.has(r.rowIndex)).length

    setImportReport({
      importedCount,
      matchedImportedCount,
      similarFlaggedCount: reviewRows.filter((r) => importedIndexes.has(r.rowIndex)).length,
      duplicatesImported: duplicatesImportedCount,
      duplicateCount: duplicateRows.length,
      failedCount: errorRows.length,
      ignoredEmptyRows,
      rows,
      timestamp: new Date(),
    })
  }

  function handleReset() {
    setStep('upload')
    setAllRows([])
    setIgnoredEmptyRows(0)
    setMatchedRows([])
    setReviewRows([])
    setDuplicateRows([])
    setErrorRows([])
    setReviewQueue([])
    setReviewEdits({})
    setReviewTmdbLinks({})
    setImportReport(null)
    setParseProgress(0)
    setMatchedProgress(null)
    setReviewProgress(null)
    accImportedCount.current = 0
    accImportedIndexes.current = new Set()
  }

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------
  return (
    <AppLayout title="Import" subtitle="Bulk import from Excel or CSV">
      <AnimatePresence mode="wait">

        {step === 'upload' && (
          <motion.div key="upload" initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -20 }}>
            <GlassCard padding="md">
              <ImportDropzone onFileParsed={handleFileParsed} loading={false} />
            </GlassCard>
          </motion.div>
        )}

        {step === 'parsing' && (
          <motion.div key="parsing" initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -20 }}>
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

        {step === 'summary' && (
          <motion.div key="summary" initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -20 }}>
            <GlassCard padding="md">
              <ImportSummary
                matchedCount={matchedRows.length}
                reviewCount={reviewRows.length}
                duplicateCount={duplicateRows.length}
                errorCount={errorRows.length}
                ignoredEmptyRows={ignoredEmptyRows}
                totalRowsRead={allRows.length + ignoredEmptyRows}
                onContinue={handleSummaryContinue}
                onCancel={handleReset}
              />
            </GlassCard>
          </motion.div>
        )}

        {step === 'matched' && (
          <motion.div key="matched" initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -20 }}>
            <GlassCard padding="md">
              <MatchedTitlesView
                rows={matchedRows}
                onBack={() => setStep('summary')}
                onAddAll={handleImportMatched}
                loading={matchedLoading}
                progress={matchedProgress}
              />
            </GlassCard>
          </motion.div>
        )}

        {step === 'review' && (
          <motion.div key="review" initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -20 }}>
            <GlassCard padding="md">
              <ManualReviewView
                queue={reviewQueue}
                edits={reviewEdits}
                tmdbLinks={reviewTmdbLinks}
                onSaveEdits={handleSaveEdits}
                onLinkTMDB={handleLinkTMDB}
                onAddOne={handleAddOne}
                onAddRemaining={handleAddRemaining}
                onSkipRemaining={handleSkipRemaining}
                loading={reviewLoading}
                loadingRowIndex={reviewLoadingRowIndex}
                progress={reviewProgress}
              />
            </GlassCard>
          </motion.div>
        )}

        {step === 'duplicates' && (
          <motion.div key="duplicates" initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -20 }}>
            <GlassCard padding="md">
              <DuplicatesView
                rows={duplicateRows}
                onSkipAll={() => handleDuplicatesDecision(false)}
                onImportAll={() => handleDuplicatesDecision(true)}
              />
            </GlassCard>
          </motion.div>
        )}

        {step === 'report' && importReport && (
          <motion.div key="report" initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -20 }}>
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
