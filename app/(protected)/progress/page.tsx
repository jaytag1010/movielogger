'use client'

export const dynamic = 'force-dynamic'

import { useState, useMemo } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { toast } from 'sonner'
import { RefreshCw, TrendingUp, X } from 'lucide-react'
import { Timestamp } from 'firebase/firestore'
import { AppLayout } from '@/components/layout/AppLayout'
import { GlassCard } from '@/components/common/GlassCard'
import { ProgressCard } from '@/components/progress/ProgressCard'
import { FinishConfirmDialog } from '@/components/progress/FinishConfirmDialog'
import { CompletionDetailsModal, CompletionDetails } from '@/components/progress/CompletionDetailsModal'
import { TMDBLinkDialog } from '@/components/progress/TMDBLinkDialog'
import { EditEntryModal } from '@/components/media/EditEntryModal'
import { TMDBSearch } from '@/components/media/TMDBSearch'
import { Button } from '@/components/ui/button'
import { useMedia } from '@/hooks/useMedia'
import { MediaEntry, MediaStatus } from '@/types/media'
import { NormalizedTMDBResult } from '@/types/tmdb'
import { getDisplayTitle, getEffectiveMediaType } from '@/utils/formatters'
import {
  fetchMovieMetadata,
  fetchTVMetadata,
  fetchSeasonMetadata,
} from '@/lib/tmdb/api'
import { cn } from '@/utils/cn'

type ProgressFilter = 'all' | 'watching' | 'planned' | 'on_hold' | 'dropped'

const FILTER_PILLS: { label: string; value: ProgressFilter }[] = [
  { label: 'All', value: 'all' },
  { label: 'Watching', value: 'watching' },
  { label: 'Planned', value: 'planned' },
  { label: 'On Hold', value: 'on_hold' },
  { label: 'Dropped', value: 'dropped' },
]

const PROGRESS_STATUSES: MediaStatus[] = ['watching', 'planned', 'on_hold', 'dropped']

export default function ProgressPage() {
  const { entries, editEntry } = useMedia()

  // ── Filter state ──────────────────────────────────────────────────────────
  const [filter, setFilter] = useState<ProgressFilter>('watching')

  // ── Finish flow (two-step) ────────────────────────────────────────────────
  // Step 1: FinishConfirmDialog — user confirms they want to mark as finished
  // Step 2: CompletionDetailsModal — user fills in rating, date, notes
  const [finishTarget, setFinishTarget] = useState<MediaEntry | null>(null)
  const [detailsOpen, setDetailsOpen] = useState(false)
  const [finishing, setFinishing] = useState(false)

  // ── Bulk refresh ──────────────────────────────────────────────────────────
  const [refreshing, setRefreshing] = useState(false)

  // ── Per-card single refresh ───────────────────────────────────────────────
  const [singleRefreshingId, setSingleRefreshingId] = useState<string | null>(null)

  // ── Edit modal ────────────────────────────────────────────────────────────
  const [editTarget, setEditTarget] = useState<MediaEntry | null>(null)
  const [editOpen, setEditOpen] = useState(false)

  // ── TMDB search & link ────────────────────────────────────────────────────
  // linkTarget: the library entry the user wants to link a TMDB result to.
  // searchSeed: query to pre-populate when launched from a card's ⋮ menu.
  // searchKey: incrementing this forces TMDBSearch to remount with fresh defaultQuery.
  const [linkTarget, setLinkTarget] = useState<MediaEntry | null>(null)
  const [linkResult, setLinkResult] = useState<NormalizedTMDBResult | null>(null)
  const [searchSeed, setSearchSeed] = useState('')
  const [searchKey, setSearchKey] = useState(0)
  const [linking, setLinking] = useState(false)

  // ── Derived lists ─────────────────────────────────────────────────────────

  const progressEntries = useMemo(
    () =>
      entries
        .filter((e) => PROGRESS_STATUSES.includes(e.status as MediaStatus))
        // Sort by most-recently updated first so the order persists across restarts.
        // updatedAt is written by Firestore on every edit (including episode increments).
        .sort((a, b) => (b.updatedAt?.toMillis() ?? 0) - (a.updatedAt?.toMillis() ?? 0)),
    [entries]
  )

  const filteredEntries = useMemo(() => {
    if (filter === 'all') return progressEntries
    return progressEntries.filter((e) => e.status === filter)
  }, [progressEntries, filter])

  const counts: Record<ProgressFilter, number> = useMemo(() => ({
    all: progressEntries.length,
    watching: progressEntries.filter((e) => e.status === 'watching').length,
    planned: progressEntries.filter((e) => e.status === 'planned').length,
    on_hold: progressEntries.filter((e) => e.status === 'on_hold').length,
    dropped: progressEntries.filter((e) => e.status === 'dropped').length,
  }), [progressEntries])

  // ── Episode controls ──────────────────────────────────────────────────────

  async function handleDecrement(entry: MediaEntry) {
    const current = entry.nextEpisodeToWatch ?? 0
    if (current <= 0) return
    try {
      await editEntry(entry.id!, { nextEpisodeToWatch: current - 1 })
    } catch {
      toast.error('Failed to update progress')
    }
  }

  async function handleIncrement(entry: MediaEntry) {
    const current = entry.nextEpisodeToWatch ?? 0
    const next = current + 1
    try {
      // Allow increment beyond totalEpisodes — the series may have more episodes
      // than initially recorded. totalEpisodes is only updated on completion.
      if (entry.status === 'planned') {
        await editEntry(entry.id!, { status: 'watching', nextEpisodeToWatch: next })
      } else {
        await editEntry(entry.id!, { nextEpisodeToWatch: next })
      }
    } catch {
      toast.error('Failed to update episode')
    }
  }

  // ── Finish flow ───────────────────────────────────────────────────────────

  /** Step 1 confirmed — open the Completion Details modal. */
  function handleFinishConfirmed() {
    setDetailsOpen(true)
  }

  /** Step 2 submitted — write the completion to Firestore. */
  async function handleSaveAndComplete(details: CompletionDetails) {
    if (!finishTarget?.id) return
    setFinishing(true)
    try {
      // nextEpisodeToWatch is the NEXT unwatched episode, so episodes actually
      // watched = nextEpisodeToWatch - 1. If the user watched past the recorded
      // total (e.g. bonus episodes), update totalEpisodes to match — but never
      // reduce it.
      const watchedEpisodes = (finishTarget.nextEpisodeToWatch ?? 1) - 1
      const shouldUpdateTotal =
        getEffectiveMediaType(finishTarget) === 'series' &&
        watchedEpisodes > 0 &&
        (finishTarget.totalEpisodes == null || watchedEpisodes > finishTarget.totalEpisodes)

      await editEntry(finishTarget.id, {
        status: 'completed',
        dateFinished: Timestamp.fromDate(new Date(details.dateFinished)),
        personalRating: details.personalRating,
        specialNotes: details.specialNotes,
        nextEpisodeToWatch: null,
        ...(shouldUpdateTotal ? { totalEpisodes: watchedEpisodes } : {}),
      })
      toast.success(`"${getDisplayTitle(finishTarget)}" marked as finished!`)
      setFinishTarget(null)
      setDetailsOpen(false)
    } catch {
      toast.error('Failed to update entry')
    } finally {
      setFinishing(false)
    }
  }

  // ── Edit entry ────────────────────────────────────────────────────────────

  function handleEdit(entry: MediaEntry) {
    setEditTarget(entry)
    setEditOpen(true)
  }

  // ── TMDB Search + Link ────────────────────────────────────────────────────

  /** Called from a card's ⋮ → Search TMDB. Pre-seeds the search bar. */
  function handleSearchTMDB(entry: MediaEntry) {
    setLinkTarget(entry)
    setSearchSeed(entry.title)       // seed with canonical (undecorated) title
    setSearchKey((k) => k + 1)       // force TMDBSearch remount with fresh query
  }

  /** Clear the active link target and reset the search bar. */
  function clearLinkTarget() {
    setLinkTarget(null)
    setSearchSeed('')
    setSearchKey((k) => k + 1)
  }

  /** Called when user selects a result from the TMDB search dropdown. */
  function handleSearchSelect(result: NormalizedTMDBResult) {
    if (!linkTarget) {
      toast.info('Click ⋮ on a card and choose "Search TMDB" to link a result to an entry')
      return
    }
    setLinkResult(result)
  }

  /** Confirm the TMDB link: fetch full metadata, update the entry. */
  async function handleConfirmLink() {
    if (!linkTarget?.id || !linkResult) return
    setLinking(true)
    try {
      // Fetch full TMDB metadata (search results are sparse)
      const fullData = linkResult.type === 'movie'
        ? await fetchMovieMetadata(linkResult.tmdbId)
        : await fetchTVMetadata(linkResult.tmdbId)

      // Build the TMDB-authoritative update — never touch user-owned fields
      const updates: Parameters<typeof editEntry>[1] = {
        tmdbId: fullData.tmdbId,
        type: fullData.type,
        posterUrl: fullData.posterUrl,
        backdropUrl: fullData.backdropUrl,
        country: fullData.country,
        ageRating: fullData.ageRating,
        genres: fullData.genres,
        yearMade: fullData.year ?? linkTarget.yearMade,
        tmdbReleaseDate: fullData.releaseDate ?? null,
      }

      if (fullData.type === 'series') {
        // Series without a tracked season → use series-level episode count + runtime
        if (!linkTarget.seasonNumber) {
          if (fullData.totalEpisodes) updates.totalEpisodes = fullData.totalEpisodes
          if (fullData.runtime) updates.episodeDurationMinutes = fullData.runtime
        } else {
          // Fetch season-specific data — overrides series-level
          try {
            const seasonData = await fetchSeasonMetadata(fullData.tmdbId, linkTarget.seasonNumber)
            if (seasonData.posterUrl) updates.posterUrl = seasonData.posterUrl
            if (seasonData.year) updates.yearMade = seasonData.year
            if (seasonData.episodeCount) updates.totalEpisodes = seasonData.episodeCount
            if (seasonData.avgRuntime) updates.episodeDurationMinutes = seasonData.avgRuntime
            if (seasonData.episodeCount && seasonData.avgRuntime) {
              updates.watchHours = Math.round(
                seasonData.episodeCount * seasonData.avgRuntime / 60 * 100
              ) / 100
            }
          } catch {
            // Season fetch failure is non-fatal
          }
        }
      } else {
        // Movie runtime → episodeDurationMinutes
        if (fullData.runtime) updates.episodeDurationMinutes = fullData.runtime
      }

      await editEntry(linkTarget.id, updates)
      toast.success(`Linked "${getDisplayTitle(linkTarget)}" to TMDB`)

      // Reset link state
      setLinkTarget(null)
      setLinkResult(null)
      setSearchSeed('')
      setSearchKey((k) => k + 1)
    } catch {
      toast.error('Failed to link entry to TMDB')
    } finally {
      setLinking(false)
    }
  }

  // ── Per-card TMDB refresh (fills only null/empty fields) ──────────────────

  async function handleRefreshMetadata(entry: MediaEntry) {
    if (!entry.tmdbId) {
      toast.info('No TMDB ID — use ⋮ → Search TMDB to link this entry first')
      return
    }
    setSingleRefreshingId(entry.id!)
    try {
      const updates: Parameters<typeof editEntry>[1] = {}

      if (entry.type === 'movie') {
        const data = await fetchMovieMetadata(entry.tmdbId)
        if (!entry.posterUrl && data.posterUrl) updates.posterUrl = data.posterUrl
        if (!entry.backdropUrl && data.backdropUrl) updates.backdropUrl = data.backdropUrl
        if (!entry.yearMade && data.year) updates.yearMade = data.year
        if (!entry.ageRating && data.ageRating) updates.ageRating = data.ageRating
        if (!entry.genres?.length && data.genres.length) updates.genres = data.genres
        if (!entry.country && data.country) updates.country = data.country
        if (!entry.episodeDurationMinutes && data.runtime) updates.episodeDurationMinutes = data.runtime
        if (!entry.tmdbReleaseDate && data.releaseDate) updates.tmdbReleaseDate = data.releaseDate
      } else {
        // Series: try season-level first, then fall back to series-level
        if (entry.seasonNumber) {
          try {
            const sd = await fetchSeasonMetadata(entry.tmdbId, entry.seasonNumber)
            if (!entry.posterUrl && sd.posterUrl) updates.posterUrl = sd.posterUrl
            if (!entry.yearMade && sd.year) updates.yearMade = sd.year
            if (!entry.episodeDurationMinutes && sd.avgRuntime) updates.episodeDurationMinutes = sd.avgRuntime
            if (sd.episodeCount > (entry.totalEpisodes ?? 0)) updates.totalEpisodes = sd.episodeCount
            if (updates.totalEpisodes && (updates.episodeDurationMinutes ?? entry.episodeDurationMinutes)) {
              const eps = updates.totalEpisodes
              const mins = updates.episodeDurationMinutes ?? entry.episodeDurationMinutes!
              if (!entry.watchHours) updates.watchHours = Math.round(eps * mins / 60 * 100) / 100
            }
          } catch { /* non-fatal */ }
        }
        const sd = await fetchTVMetadata(entry.tmdbId)
        if (!entry.backdropUrl && sd.backdropUrl) updates.backdropUrl = sd.backdropUrl
        if (!entry.ageRating && sd.ageRating) updates.ageRating = sd.ageRating
        if (!entry.genres?.length && sd.genres.length) updates.genres = sd.genres
        if (!entry.country && sd.country) updates.country = sd.country
        if (!entry.posterUrl && !updates.posterUrl && sd.posterUrl) updates.posterUrl = sd.posterUrl
        if (!entry.seasonNumber && sd.totalEpisodes && sd.totalEpisodes > (entry.totalEpisodes ?? 0)) {
          updates.totalEpisodes = sd.totalEpisodes
        }
        if (!entry.tmdbReleaseDate && sd.releaseDate) updates.tmdbReleaseDate = sd.releaseDate
      }

      if (Object.keys(updates).length > 0) {
        await editEntry(entry.id!, updates)
        toast.success(`Refreshed metadata for "${getDisplayTitle(entry)}"`)
      } else {
        toast.info('All fields already populated')
      }
    } catch {
      toast.error('Failed to refresh metadata')
    } finally {
      setSingleRefreshingId(null)
    }
  }

  // ── Bulk TMDB refresh (unchanged from before) ─────────────────────────────

  async function handleBulkRefresh() {
    const toRefresh = progressEntries.filter((e) => e.tmdbId != null)
    if (toRefresh.length === 0) {
      toast.info('No entries with TMDB IDs to refresh')
      return
    }
    setRefreshing(true)
    let updated = 0
    let failed = 0

    for (const entry of toRefresh) {
      try {
        const updates: Parameters<typeof editEntry>[1] = {}

        if (entry.type === 'movie') {
          const data = await fetchMovieMetadata(entry.tmdbId!)
          if (!entry.posterUrl && data.posterUrl) updates.posterUrl = data.posterUrl
          if (!entry.backdropUrl && data.backdropUrl) updates.backdropUrl = data.backdropUrl
          if (!entry.yearMade && data.year) updates.yearMade = data.year
          if (!entry.ageRating && data.ageRating) updates.ageRating = data.ageRating
          if (!entry.genres?.length && data.genres.length) updates.genres = data.genres
          if (!entry.country && data.country) updates.country = data.country
          if (!entry.episodeDurationMinutes && data.runtime) updates.episodeDurationMinutes = data.runtime
          if (!entry.tmdbReleaseDate && data.releaseDate) updates.tmdbReleaseDate = data.releaseDate
        } else {
          if (entry.seasonNumber) {
            try {
              const sd = await fetchSeasonMetadata(entry.tmdbId!, entry.seasonNumber)
              if (!entry.posterUrl && sd.posterUrl) updates.posterUrl = sd.posterUrl
              if (!entry.yearMade && sd.year) updates.yearMade = sd.year
              if (!entry.episodeDurationMinutes && sd.avgRuntime) updates.episodeDurationMinutes = sd.avgRuntime
              if (sd.episodeCount > (entry.totalEpisodes ?? 0)) updates.totalEpisodes = sd.episodeCount
              if (updates.totalEpisodes && (updates.episodeDurationMinutes ?? entry.episodeDurationMinutes)) {
                const eps = updates.totalEpisodes
                const mins = updates.episodeDurationMinutes ?? entry.episodeDurationMinutes!
                if (!entry.watchHours) updates.watchHours = Math.round(eps * mins / 60 * 100) / 100
              }
            } catch { /* non-fatal */ }
          }
          const sd = await fetchTVMetadata(entry.tmdbId!)
          if (!entry.backdropUrl && sd.backdropUrl) updates.backdropUrl = sd.backdropUrl
          if (!entry.ageRating && sd.ageRating) updates.ageRating = sd.ageRating
          if (!entry.genres?.length && sd.genres.length) updates.genres = sd.genres
          if (!entry.country && sd.country) updates.country = sd.country
          if (!entry.posterUrl && !updates.posterUrl && sd.posterUrl) updates.posterUrl = sd.posterUrl
          if (!entry.seasonNumber && sd.totalEpisodes && sd.totalEpisodes > (entry.totalEpisodes ?? 0)) {
            updates.totalEpisodes = sd.totalEpisodes
          }
          if (!entry.tmdbReleaseDate && sd.releaseDate) updates.tmdbReleaseDate = sd.releaseDate
        }

        if (Object.keys(updates).length > 0) {
          await editEntry(entry.id!, updates)
          updated++
        }
      } catch {
        failed++
      }
    }

    setRefreshing(false)

    if (updated > 0 && failed === 0) {
      toast.success(`Refreshed ${updated} entr${updated === 1 ? 'y' : 'ies'} with missing data`)
    } else if (updated > 0) {
      toast.success(`Refreshed ${updated} — ${failed} failed`)
    } else if (failed > 0) {
      toast.error(`Refresh failed for ${failed} entr${failed === 1 ? 'y' : 'ies'}`)
    } else {
      toast.info('All fields already populated — nothing to refresh')
    }
  }

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <AppLayout
      title="Progress"
      subtitle={`${progressEntries.length} title${progressEntries.length !== 1 ? 's' : ''} in progress`}
    >
      <div className="space-y-3">

        {/* ── TMDB Repair Search ── */}
        <GlassCard padding="sm">
          <div className="space-y-2">
            {/* Context indicator — shows which entry is being targeted */}
            {linkTarget ? (
              <div className="flex items-center justify-between gap-2 px-1">
                <p className="text-xs text-blue-400 truncate">
                  <span className="text-blue-400/50">Linking: </span>
                  <span className="font-medium">{getDisplayTitle(linkTarget)}</span>
                </p>
                <button
                  type="button"
                  onClick={clearLinkTarget}
                  className="flex-shrink-0 text-white/30 hover:text-white/60 transition-colors"
                  aria-label="Clear link target"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
            ) : (
              <p className="text-xs text-white/30 px-1">
                TMDB Repair — click <span className="text-white/50">⋮ → Search TMDB</span> on a card to link it
              </p>
            )}

            <TMDBSearch
              key={searchKey}
              mediaType="all"
              onSelect={handleSearchSelect}
              placeholder="Search TMDB to link or repair an entry…"
              defaultQuery={searchSeed}
            />
          </div>
        </GlassCard>

        {/* ── Filter pills + Bulk Refresh ── */}
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-1.5 flex-wrap">
            {FILTER_PILLS.map(({ label, value }) => (
              <button
                key={value}
                type="button"
                onClick={() => setFilter(value)}
                className={cn(
                  'inline-flex items-center gap-1.5 text-xs font-medium rounded-full px-3 py-1.5 border transition-all',
                  filter === value
                    ? 'bg-blue-600/20 border-blue-500/40 text-blue-300'
                    : 'bg-white/5 border-white/10 text-white/50 hover:bg-white/10 hover:text-white/70'
                )}
              >
                {label}
                {counts[value] > 0 && (
                  <span className={cn(
                    'text-[10px] rounded-full px-1.5 py-0.5 font-bold',
                    filter === value ? 'bg-blue-500/30 text-blue-300' : 'bg-white/10 text-white/30'
                  )}>
                    {counts[value]}
                  </span>
                )}
              </button>
            ))}
          </div>

          <Button
            variant="outline"
            size="sm"
            onClick={handleBulkRefresh}
            disabled={refreshing || progressEntries.filter((e) => e.tmdbId != null).length === 0}
            className="shrink-0 text-xs border-white/10 text-white/50 hover:text-white hover:bg-white/10"
          >
            <RefreshCw className={cn('w-3.5 h-3.5 mr-1.5', refreshing && 'animate-spin')} />
            {refreshing ? 'Refreshing…' : 'Refresh All'}
          </Button>
        </div>

        {/* ── Entry list ── */}
        <GlassCard padding="sm">
          <AnimatePresence mode="popLayout">
            {filteredEntries.length === 0 ? (
              <motion.div
                key="empty"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="py-12 text-center"
              >
                <TrendingUp className="w-10 h-10 text-white/10 mx-auto mb-3" />
                <p className="text-white/40 text-sm font-medium">
                  {filter === 'all'
                    ? 'No titles in progress'
                    : `No ${filter === 'on_hold' ? 'on-hold' : filter} titles`}
                </p>
                <p className="text-white/20 text-xs mt-1">
                  Add entries to start tracking
                </p>
              </motion.div>
            ) : (
              <div className="space-y-1.5">
                {filteredEntries.map((entry) => (
                  <motion.div
                    key={entry.id}
                    layout
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, scale: 0.97 }}
                    transition={{ duration: 0.15 }}
                  >
                    <ProgressCard
                      entry={entry}
                      onDecrement={handleDecrement}
                      onIncrement={handleIncrement}
                      onFinish={(e) => setFinishTarget(e)}
                      onEdit={handleEdit}
                      onSearchTMDB={handleSearchTMDB}
                      onRefreshMetadata={handleRefreshMetadata}
                      refreshing={singleRefreshingId === entry.id}
                    />
                  </motion.div>
                ))}
              </div>
            )}
          </AnimatePresence>
        </GlassCard>
      </div>

      {/* ── Dialogs ── */}

      <FinishConfirmDialog
        entry={finishTarget}
        open={finishTarget != null && !detailsOpen}
        onOpenChange={(open) => { if (!open) setFinishTarget(null) }}
        onConfirm={handleFinishConfirmed}
      />

      <CompletionDetailsModal
        entry={finishTarget}
        open={detailsOpen}
        onOpenChange={(open) => {
          setDetailsOpen(open)
          if (!open) setFinishTarget(null)
        }}
        onConfirm={handleSaveAndComplete}
        loading={finishing}
      />

      <TMDBLinkDialog
        entry={linkTarget}
        tmdbResult={linkResult}
        open={linkResult != null}
        onOpenChange={(open) => { if (!open) setLinkResult(null) }}
        onConfirm={handleConfirmLink}
        loading={linking}
      />

      <EditEntryModal
        entry={editTarget}
        open={editOpen}
        onOpenChange={(open) => {
          setEditOpen(open)
          if (!open) setEditTarget(null)
        }}
      />
    </AppLayout>
  )
}
