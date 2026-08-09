'use client'

export const dynamic = 'force-dynamic'

import { useState, useEffect, useMemo } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { motion, AnimatePresence } from 'framer-motion'
import { toast } from 'sonner'
import { RefreshCw, TrendingUp, X } from 'lucide-react'
import { Timestamp } from 'firebase/firestore'
import { AppLayout } from '@/components/layout/AppLayout'
import { GlassCard } from '@/components/common/GlassCard'
import { ProgressCard } from '@/components/progress/ProgressCard'
import { FinishConfirmDialog } from '@/components/progress/FinishConfirmDialog'
import { CompletionDetailsModal, CompletionDetails } from '@/components/progress/CompletionDetailsModal'
import { CompletionStatisticsModal } from '@/components/progress/CompletionStatisticsModal'
import { TMDBLinkDialog } from '@/components/progress/TMDBLinkDialog'
import { EditEntryModal } from '@/components/media/EditEntryModal'
import { TMDBSearch } from '@/components/media/TMDBSearch'
import { Button } from '@/components/ui/button'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { useMedia } from '@/hooks/useMedia'
import { useAuthStore } from '@/store/authStore'
import { addActivity } from '@/lib/firebase/activity'
import { useProgressReleaseStatuses } from '@/hooks/useProgressReleaseStatuses'
import { MediaEntry, MediaStatus } from '@/types/media'
import { NormalizedTMDBResult } from '@/types/tmdb'
import { getDisplayTitle, getEffectiveMediaType, getEpisodesWatched } from '@/utils/formatters'
import { comparePriorityAscThenCreatedDesc, comparePriorityDescThenCreatedDesc } from '@/utils/priority'
import {
  fetchMovieMetadata,
  fetchTVMetadata,
  fetchSeasonMetadata,
  fetchTVAvailabilityInfo,
} from '@/lib/tmdb/api'
import { cn } from '@/utils/cn'
import {
  calculateCompletionStatistics,
  CompletionStatistics,
} from '@/utils/completionStatistics'
import { compareDateAdded, compareDateAddedDesc, getInternalIdSortNumber } from '@/utils/internalIdSort'

type ProgressFilter = 'all' | 'watching' | 'planned' | 'on_hold' | 'dropped'
type ProgressSort =
  | 'episodesWaiting'
  | 'episodesWatched'
  | 'progressPercent'
  | 'releaseStatus'
  | 'alpha'
  | 'dateAddedDesc'
  | 'dateAddedAsc'
  | 'priorityDesc'
  | 'priorityAsc'
  | 'ratingDesc'
  | 'status'
  | 'recentlyUpdated'

const SORT_STORAGE_KEY = 'movielogger.progressSortPrefs'
const WATCHING_SORT_SESSION_KEY = 'movielogger.progressWatchingSort'

const FILTER_PILLS: { label: string; value: ProgressFilter }[] = [
  { label: 'All', value: 'all' },
  { label: 'Watching', value: 'watching' },
  { label: 'Planned', value: 'planned' },
  { label: 'On Hold', value: 'on_hold' },
  { label: 'Dropped', value: 'dropped' },
]

const PROGRESS_STATUSES: MediaStatus[] = ['watching', 'planned', 'on_hold', 'dropped']
const STATUS_SORT_ORDER: Record<ProgressFilter, number> = {
  watching: 0,
  planned: 1,
  on_hold: 2,
  dropped: 3,
  all: 4,
}

const DEFAULT_SORT_BY_FILTER: Record<ProgressFilter, ProgressSort> = {
  all: 'dateAddedDesc',
  watching: 'recentlyUpdated',
  planned: 'priorityDesc',
  on_hold: 'priorityDesc',
  dropped: 'dateAddedDesc',
}

const SORT_OPTIONS_BY_FILTER: Record<ProgressFilter, { label: string; value: ProgressSort }[]> = {
  all: [
    { label: 'Date Added (Newest)', value: 'dateAddedDesc' },
    { label: 'Date Added (Oldest)', value: 'dateAddedAsc' },
    { label: 'Alphabetical (A-Z)', value: 'alpha' },
    { label: 'Status', value: 'status' },
  ],
  watching: [
    { label: 'Recently Updated (Default)', value: 'recentlyUpdated' },
    { label: 'Episodes Waiting (Highest)', value: 'episodesWaiting' },
    { label: 'Episodes Watched (Highest)', value: 'episodesWatched' },
    { label: 'Progress Percentage (Highest)', value: 'progressPercent' },
    { label: 'Release Status', value: 'releaseStatus' },
    { label: 'Alphabetical (A-Z)', value: 'alpha' },
    { label: 'Date Added (Newest)', value: 'dateAddedDesc' },
    { label: 'Date Added (Oldest)', value: 'dateAddedAsc' },
  ],
  planned: [
    { label: 'Highest Priority', value: 'priorityDesc' },
    { label: 'Lowest Priority', value: 'priorityAsc' },
    { label: 'Date Added (Newest)', value: 'dateAddedDesc' },
    { label: 'Date Added (Oldest)', value: 'dateAddedAsc' },
    { label: 'Alphabetical (A-Z)', value: 'alpha' },
  ],
  on_hold: [
    { label: 'Highest Priority', value: 'priorityDesc' },
    { label: 'Lowest Priority', value: 'priorityAsc' },
    { label: 'Date Added (Newest)', value: 'dateAddedDesc' },
    { label: 'Date Added (Oldest)', value: 'dateAddedAsc' },
    { label: 'Alphabetical (A-Z)', value: 'alpha' },
  ],
  dropped: [
    { label: 'Date Added (Newest)', value: 'dateAddedDesc' },
    { label: 'Date Added (Oldest)', value: 'dateAddedAsc' },
    { label: 'Personal Rating (Highest)', value: 'ratingDesc' },
    { label: 'Alphabetical (A-Z)', value: 'alpha' },
  ],
}

function sortProgressEntries(a: MediaEntry, b: MediaEntry): number {
  return (b.updatedAt?.toMillis() ?? 0) - (a.updatedAt?.toMillis() ?? 0)
}

function sortCreatedDescThenTitleAsc(a: MediaEntry, b: MediaEntry): number {
  return compareDateAddedDesc(a, b)
}

function sortCreatedAscThenTitleAsc(a: MediaEntry, b: MediaEntry): number {
  return compareDateAdded(a, b)
}

function formatValue(value: unknown): string {
  if (Array.isArray(value)) return value.join(', ') || '—'
  if (value == null || value === '') return '—'
  return String(value)
}

function formatDateValue(value: string | null | undefined): string {
  if (!value) return '—'
  return new Date(`${value}T00:00:00`).toLocaleDateString('en-US', {
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  })
}

function formatFieldValue(field: string, value: unknown): string {
  if (field === 'episodeDurationMinutes') return value == null ? '—' : `${value} min`
  if (field === 'tmdbReleaseDate') return formatDateValue(value as string | null | undefined)
  if (field === 'posterUrl') return value ? 'Poster available' : 'No poster'
  return formatValue(value)
}

function todayIsoLocal(): string {
  const now = new Date()
  const year = now.getFullYear()
  const month = String(now.getMonth() + 1).padStart(2, '0')
  const day = String(now.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

function movieReleaseStatusLabel(releaseDate: string | null | undefined): string {
  if (!releaseDate) return 'Movie release date unavailable'
  return releaseDate > todayIsoLocal()
    ? `Releases on ${formatDateValue(releaseDate)}`
    : 'Movie Released'
}

function seriesReleaseStatusLabel(airedEpisodes: number, expectedEpisodes: number, firstAirDate?: string | null): string {
  if (expectedEpisodes <= 0) return 'Episode release information unavailable'
  if (airedEpisodes === 0) {
    return firstAirDate
      ? `Season premieres on ${formatDateValue(firstAirDate)}`
      : 'Episode release information unavailable'
  }
  const released = Math.min(airedEpisodes, expectedEpisodes)
  if (released >= expectedEpisodes) return 'All Episodes Released'
  const noun = released === 1 ? 'Episode' : 'Episodes'
  return `${released}/${expectedEpisodes} ${noun} Released`
}

function valuesEqual(a: unknown, b: unknown): boolean {
  const normalize = (value: unknown): unknown => {
    if (value == null || value === '') return null
    if (typeof value === 'number') return value
    if (typeof value === 'string') {
      const stripped = value
        .replace(/^[^A-Za-z0-9]+/, '')
        .replace(/\s+/g, ' ')
        .trim()
        .toLowerCase()
      if (stripped === '') return null
      const numeric = Number(stripped)
      return Number.isFinite(numeric) && stripped === String(numeric) ? numeric : stripped
    }
    return value
  }

  if (Array.isArray(a) || Array.isArray(b)) {
    const normalizeArray = (value: unknown) =>
      (Array.isArray(value) ? value : [])
        .map(normalize)
        .filter((item) => item != null)
        .sort()
    return JSON.stringify(normalizeArray(a)) === JSON.stringify(normalizeArray(b))
  }
  return normalize(a) === normalize(b)
}

type RefreshChange = {
  field: string
  before: string
  after: string
}

type RefreshUpdatedTitle = {
  id: string
  title: string
  changes: RefreshChange[]
}

type RefreshFailure = {
  id: string
  title: string
  reason: string
}

type RefreshSummary = {
  checked: number
  updated: RefreshUpdatedTitle[]
  unchanged: MediaEntry[]
  failed: RefreshFailure[]
}

export default function ProgressPage() {
  const { entries, editEntry, refreshEntry } = useMedia()
  const { user } = useAuthStore()
  const router = useRouter()
  const searchParams = useSearchParams()

  // ── Filter state ──────────────────────────────────────────────────────────
  const [filter, setFilter] = useState<ProgressFilter>('watching')
  const [sortPrefs, setSortPrefs] = useState<Record<ProgressFilter, ProgressSort>>(DEFAULT_SORT_BY_FILTER)
  const filteredIdsParam = searchParams.get('ids')
  const filteredLabel = searchParams.get('label')

  useEffect(() => {
    try {
      const raw = localStorage.getItem(SORT_STORAGE_KEY)
      const sessionWatching = sessionStorage.getItem(WATCHING_SORT_SESSION_KEY) as ProgressSort | null
      if (!raw) {
        setSortPrefs({
          ...DEFAULT_SORT_BY_FILTER,
          watching: sessionWatching ?? DEFAULT_SORT_BY_FILTER.watching,
        })
        return
      }
      const parsed = JSON.parse(raw) as Partial<Record<ProgressFilter, ProgressSort>>
      setSortPrefs({
        all: parsed.all ?? DEFAULT_SORT_BY_FILTER.all,
        watching: sessionWatching ?? DEFAULT_SORT_BY_FILTER.watching,
        planned: parsed.planned ?? DEFAULT_SORT_BY_FILTER.planned,
        on_hold: parsed.on_hold ?? DEFAULT_SORT_BY_FILTER.on_hold,
        dropped: parsed.dropped ?? DEFAULT_SORT_BY_FILTER.dropped,
      })
    } catch {
      setSortPrefs(DEFAULT_SORT_BY_FILTER)
    }
  }, [])

  function updateSortPreference(value: ProgressSort) {
    setSortPrefs((current) => {
      const next = { ...current, [filter]: value }
      if (filter === 'watching') {
        sessionStorage.setItem(WATCHING_SORT_SESSION_KEY, value)
      } else {
        const persisted = { ...next, watching: DEFAULT_SORT_BY_FILTER.watching }
        localStorage.setItem(SORT_STORAGE_KEY, JSON.stringify(persisted))
      }
      return next
    })
  }

  useEffect(() => {
    const requestedFilter = searchParams.get('filter')
    if (
      requestedFilter === 'all' ||
      requestedFilter === 'watching' ||
      requestedFilter === 'planned' ||
      requestedFilter === 'on_hold' ||
      requestedFilter === 'dropped'
    ) {
      setFilter(requestedFilter)
    }
  }, [searchParams])

  // ── Finish flow (two-step) ────────────────────────────────────────────────
  // Step 1: FinishConfirmDialog — user confirms they want to mark as finished
  // Step 2: CompletionDetailsModal — user fills in rating, date, notes
  const [finishTarget, setFinishTarget] = useState<MediaEntry | null>(null)
  const [detailsOpen, setDetailsOpen] = useState(false)
  const [finishing, setFinishing] = useState(false)
  const [completionStatistics, setCompletionStatistics] = useState<CompletionStatistics | null>(null)

  // ── Bulk refresh ──────────────────────────────────────────────────────────
  const [refreshing, setRefreshing] = useState(false)
  const [refreshProgress, setRefreshProgress] = useState({ current: 0, total: 0 })
  const [refreshSummary, setRefreshSummary] = useState<RefreshSummary | null>(null)

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
  const [repairOpen, setRepairOpen] = useState(false)

  // ── Derived lists ─────────────────────────────────────────────────────────

  const progressEntries = useMemo(
    () =>
      entries
        .filter((e) => PROGRESS_STATUSES.includes(e.status as MediaStatus))
        .sort(sortProgressEntries),
    [entries]
  )

  const filteredIdSet = useMemo(() => {
    if (!filteredIdsParam) return null
    const ids = filteredIdsParam.split(',').map((id) => id.trim()).filter(Boolean)
    return ids.length > 0 ? new Set(ids) : null
  }, [filteredIdsParam])

  const notificationEntries = useMemo(() => {
    if (!filteredIdSet) return null
    return progressEntries.filter((e) => e.id && filteredIdSet.has(e.id))
  }, [filteredIdSet, progressEntries])

  const releaseStatuses = useProgressReleaseStatuses(progressEntries)

  function compareBySort(a: MediaEntry, b: MediaEntry, sortBy: ProgressSort): number {
    switch (sortBy) {
      case 'recentlyUpdated': {
        const activityDiff =
          (b.watchingActivityAt?.toMillis?.() ?? b.createdAt?.toMillis?.() ?? 0) -
          (a.watchingActivityAt?.toMillis?.() ?? a.createdAt?.toMillis?.() ?? 0)
        if (activityDiff !== 0) return activityDiff

        const idDiff = getInternalIdSortNumber(b) - getInternalIdSortNumber(a)
        if (idDiff !== 0) return idDiff

        return a.title.localeCompare(b.title)
      }
      case 'episodesWaiting': {
        const waitingDiff =
          (releaseStatuses[b.id ?? '']?.episodesWaiting ?? 0) -
          (releaseStatuses[a.id ?? '']?.episodesWaiting ?? 0)
        if (waitingDiff !== 0) return waitingDiff
        return sortCreatedDescThenTitleAsc(a, b)
      }
      case 'episodesWatched': {
        const watchedDiff = getEpisodesWatched(b) - getEpisodesWatched(a)
        if (watchedDiff !== 0) return watchedDiff
        return sortCreatedDescThenTitleAsc(a, b)
      }
      case 'progressPercent': {
        const pct = (entry: MediaEntry) => {
          const total = getEffectiveMediaType(entry) === 'movie'
            ? (entry.totalEpisodes ?? 1)
            : (entry.totalEpisodes ?? 0)
          return total > 0 ? getEpisodesWatched(entry) / total : 0
        }
        const pctDiff = pct(b) - pct(a)
        if (pctDiff !== 0) return pctDiff
        return sortCreatedDescThenTitleAsc(a, b)
      }
      case 'releaseStatus': {
        const rankDiff =
          (releaseStatuses[b.id ?? '']?.releaseRank ?? 0) -
          (releaseStatuses[a.id ?? '']?.releaseRank ?? 0)
        if (rankDiff !== 0) return rankDiff
        return sortCreatedDescThenTitleAsc(a, b)
      }
      case 'priorityDesc':
        return comparePriorityDescThenCreatedDesc(a, b)
      case 'priorityAsc':
        return comparePriorityAscThenCreatedDesc(a, b)
      case 'dateAddedAsc':
        return sortCreatedAscThenTitleAsc(a, b)
      case 'alpha':
        return a.title.localeCompare(b.title)
      case 'ratingDesc': {
        const ratingDiff = (b.personalRating ?? -1) - (a.personalRating ?? -1)
        if (ratingDiff !== 0) return ratingDiff
        return sortCreatedDescThenTitleAsc(a, b)
      }
      case 'status': {
        const statusDiff =
          STATUS_SORT_ORDER[a.status as ProgressFilter] -
          STATUS_SORT_ORDER[b.status as ProgressFilter]
        if (statusDiff !== 0) return statusDiff
        return compareBySort(a, b, sortPrefs[a.status as ProgressFilter] ?? DEFAULT_SORT_BY_FILTER[a.status as ProgressFilter])
      }
      case 'dateAddedDesc':
      default:
        return sortCreatedDescThenTitleAsc(a, b)
    }
  }

  const filteredEntries = useMemo(() => {
    const sortBy = sortPrefs[filter] ?? DEFAULT_SORT_BY_FILTER[filter]
    if (notificationEntries) {
      const notificationSort = filteredLabel === 'Ready to Binge' ? 'priorityDesc' : sortBy
      return [...notificationEntries].sort((a, b) => compareBySort(a, b, notificationSort))
    }
    const matchingEntries = filter === 'all'
      ? progressEntries
      : progressEntries.filter((e) => e.status === filter)
    return [...matchingEntries].sort((a, b) => compareBySort(a, b, sortBy))
  }, [notificationEntries, filteredLabel, progressEntries, filter, sortPrefs, releaseStatuses])

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
      const watchedEpisodes = getEpisodesWatched(finishTarget)
      const shouldUpdateTotal =
        getEffectiveMediaType(finishTarget) === 'series' &&
        watchedEpisodes > 0 &&
        (finishTarget.totalEpisodes == null || watchedEpisodes > finishTarget.totalEpisodes)
      const completedTotalEpisodes = shouldUpdateTotal ? watchedEpisodes : finishTarget.totalEpisodes
      const completedEpisodesWatched = completedTotalEpisodes ?? watchedEpisodes
      const completedWatchHours = getEffectiveMediaType(finishTarget) === 'series'
        ? completedTotalEpisodes != null
          ? Math.round((completedTotalEpisodes * details.episodeDurationMinutes / 60) * 100) / 100
          : null
        : Math.round((details.episodeDurationMinutes / 60) * 100) / 100

      const completedAt = Timestamp.fromDate(new Date(details.dateFinished))
      await editEntry(finishTarget.id, {
        status: 'completed',
        dateFinished: completedAt,
        personalRating: details.personalRating,
        episodeDurationMinutes: details.episodeDurationMinutes,
        watchHours: completedWatchHours,
        specialNotes: details.specialNotes,
        nextEpisodeToWatch: completedEpisodesWatched,
        ...(shouldUpdateTotal ? { totalEpisodes: watchedEpisodes } : {}),
      })

      const completedEntry: MediaEntry = {
        ...finishTarget,
        status: 'completed',
        dateFinished: completedAt,
        personalRating: details.personalRating,
        episodeDurationMinutes: details.episodeDurationMinutes,
        watchHours: completedWatchHours,
        specialNotes: details.specialNotes,
        nextEpisodeToWatch: completedEpisodesWatched,
        totalEpisodes: completedTotalEpisodes,
        updatedAt: Timestamp.now(),
      }
      const completedLibrary = entries.some((entry) => entry.id === completedEntry.id)
        ? entries.map((entry) => entry.id === completedEntry.id ? completedEntry : entry)
        : [...entries, completedEntry]

      toast.success(`"${getDisplayTitle(finishTarget)}" marked as finished!`)
      setFinishTarget(null)
      setDetailsOpen(false)
      setCompletionStatistics(calculateCompletionStatistics(completedEntry, completedLibrary))
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
    setRepairOpen(true)
  }

  /** Clear the active link target and reset the search bar. */
  function clearLinkTarget() {
    setLinkTarget(null)
    setSearchSeed('')
    setSearchKey((k) => k + 1)
    setRepairOpen(false)
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
        overview: fullData.overview ?? null,
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
      setRepairOpen(false)
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
        if (!entry.overview && data.overview) updates.overview = data.overview
        if (data.posterUrl) updates.posterUrl = data.posterUrl
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
            if (sd.posterUrl) updates.posterUrl = sd.posterUrl
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
        if (!entry.overview && sd.overview) updates.overview = sd.overview
        if (!entry.backdropUrl && sd.backdropUrl) updates.backdropUrl = sd.backdropUrl
        if (!entry.ageRating && sd.ageRating) updates.ageRating = sd.ageRating
        if (!entry.genres?.length && sd.genres.length) updates.genres = sd.genres
        if (!entry.country && sd.country) updates.country = sd.country
        if (!updates.posterUrl && sd.posterUrl) updates.posterUrl = sd.posterUrl
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
    setRefreshProgress({ current: 0, total: toRefresh.length })
    const summary: RefreshSummary = {
      checked: toRefresh.length,
      updated: [],
      unchanged: [],
      failed: [],
    }

    for (let index = 0; index < toRefresh.length; index++) {
      const entry = toRefresh[index]
      try {
        const updates: Parameters<typeof editEntry>[1] = {}
        const releaseChanges: RefreshChange[] = []
        const beforeReleaseStatus = entry.id ? releaseStatuses[entry.id] : undefined

        if (entry.type === 'movie') {
          const data = await fetchMovieMetadata(entry.tmdbId!)
          if (!entry.overview && data.overview) updates.overview = data.overview
          if (!entry.posterUrl && !entry.manualPosterUrl && data.posterUrl) updates.posterUrl = data.posterUrl
          if (data.backdropUrl && !valuesEqual(entry.backdropUrl, data.backdropUrl)) updates.backdropUrl = data.backdropUrl
          if (data.year && !valuesEqual(entry.yearMade, data.year)) updates.yearMade = data.year
          if (data.ageRating && !valuesEqual(entry.ageRating, data.ageRating)) updates.ageRating = data.ageRating
          if (data.genres.length && !valuesEqual(entry.genres, data.genres)) updates.genres = data.genres
          if (data.country && !valuesEqual(entry.country, data.country)) updates.country = data.country
          if (data.runtime && !valuesEqual(entry.episodeDurationMinutes, data.runtime)) updates.episodeDurationMinutes = data.runtime
          if (data.releaseDate && !valuesEqual(entry.tmdbReleaseDate, data.releaseDate)) updates.tmdbReleaseDate = data.releaseDate
          const afterReleaseDate = updates.tmdbReleaseDate ?? entry.tmdbReleaseDate
          const afterMovieStatus = movieReleaseStatusLabel(afterReleaseDate)
          if (beforeReleaseStatus?.label && !valuesEqual(beforeReleaseStatus.label, afterMovieStatus)) {
            releaseChanges.push({
              field: 'Movie Release Status',
              before: beforeReleaseStatus.label,
              after: afterMovieStatus,
            })
          }
        } else {
          let availability: Awaited<ReturnType<typeof fetchTVAvailabilityInfo>> | null = null
          if (entry.seasonNumber) {
            try {
              const sd = await fetchSeasonMetadata(entry.tmdbId!, entry.seasonNumber)
              if (!entry.posterUrl && !entry.manualPosterUrl && sd.posterUrl) updates.posterUrl = sd.posterUrl
              if (sd.year && !valuesEqual(entry.yearMade, sd.year)) updates.yearMade = sd.year
              if (sd.avgRuntime && !valuesEqual(entry.episodeDurationMinutes, sd.avgRuntime)) updates.episodeDurationMinutes = sd.avgRuntime
              if (sd.episodeCount && !valuesEqual(entry.totalEpisodes, sd.episodeCount)) updates.totalEpisodes = sd.episodeCount
              if (updates.totalEpisodes && (updates.episodeDurationMinutes ?? entry.episodeDurationMinutes)) {
                const eps = updates.totalEpisodes
                const mins = updates.episodeDurationMinutes ?? entry.episodeDurationMinutes!
                if (!entry.watchHours) updates.watchHours = Math.round(eps * mins / 60 * 100) / 100
              }
            } catch { /* non-fatal */ }
          }
          const sd = await fetchTVMetadata(entry.tmdbId!)
          if (!entry.overview && sd.overview) updates.overview = sd.overview
          if (sd.backdropUrl && !valuesEqual(entry.backdropUrl, sd.backdropUrl)) updates.backdropUrl = sd.backdropUrl
          if (sd.ageRating && !valuesEqual(entry.ageRating, sd.ageRating)) updates.ageRating = sd.ageRating
          if (sd.genres.length && !valuesEqual(entry.genres, sd.genres)) updates.genres = sd.genres
          if (sd.country && !valuesEqual(entry.country, sd.country)) updates.country = sd.country
          if (!entry.posterUrl && !entry.manualPosterUrl && !updates.posterUrl && sd.posterUrl) updates.posterUrl = sd.posterUrl
          if (!entry.seasonNumber && sd.totalEpisodes && !valuesEqual(entry.totalEpisodes, sd.totalEpisodes)) {
            updates.totalEpisodes = sd.totalEpisodes
          }
          if (sd.releaseDate && !valuesEqual(entry.tmdbReleaseDate, sd.releaseDate)) updates.tmdbReleaseDate = sd.releaseDate
          try {
            availability = await fetchTVAvailabilityInfo(entry.tmdbId!, entry.seasonNumber)
          } catch {
            availability = null
          }
          if (availability) {
            const afterExpectedEpisodes = updates.totalEpisodes ?? entry.totalEpisodes ?? availability.totalEpisodes
            const afterReleasedEpisodes = Math.min(availability.airedEpisodes, afterExpectedEpisodes)
            const afterReleaseStatus = seriesReleaseStatusLabel(
              availability.airedEpisodes,
              afterExpectedEpisodes,
              availability.firstEpisodeAirDate
            )
            if (
              beforeReleaseStatus?.releasedEpisodes != null &&
              beforeReleaseStatus.releasedEpisodes !== afterReleasedEpisodes
            ) {
              releaseChanges.push({
                field: 'Episodes Released',
                before: String(beforeReleaseStatus.releasedEpisodes),
                after: String(afterReleasedEpisodes),
              })
            }
            if (beforeReleaseStatus?.label && !valuesEqual(beforeReleaseStatus.label, afterReleaseStatus)) {
              releaseChanges.push({
                field: 'Release Status',
                before: beforeReleaseStatus.label,
                after: afterReleaseStatus,
              })
            }
          }
        }

        const metadataChanges = Object.entries(updates)
          .filter(([key, nextValue]) => !valuesEqual(entry[key as keyof MediaEntry], nextValue))
          .map(([key, nextValue]) => ({
                field: ({
                  posterUrl: 'Poster Added',
                  overview: 'Overview',
                  backdropUrl: 'Backdrop',
                  yearMade: 'Release Year',
                  ageRating: 'Age Rating',
                  genres: 'Genres',
                  country: 'Country',
                  episodeDurationMinutes: 'Runtime',
                  tmdbReleaseDate: 'Release Date',
                  totalEpisodes: 'TMDB Episode Count',
                  watchHours: 'Watch Hours',
                } as Partial<Record<keyof MediaEntry, string>>)[key as keyof MediaEntry] ?? key,
                before: formatFieldValue(key, entry[key as keyof MediaEntry]),
                after: formatFieldValue(key, nextValue),
              }))
        const changes = [...metadataChanges, ...releaseChanges]

        if (changes.length > 0) {
          if (Object.keys(updates).length > 0) {
            await refreshEntry(entry.id!, updates)
          }
          summary.updated.push({
            id: entry.id!,
            title: getDisplayTitle(entry),
            changes,
          })
        } else {
          summary.unchanged.push(entry)
        }
      } catch (err) {
        summary.failed.push({
          id: entry.id!,
          title: getDisplayTitle(entry),
          reason: err instanceof Error ? err.message : 'TMDB refresh failed',
        })
      } finally {
        setRefreshProgress({ current: index + 1, total: toRefresh.length })
      }
    }

    setRefreshing(false)
    setRefreshSummary(summary)
    if (user) {
      addActivity(user.uid, {
        category: 'refresh',
        action: 'Refresh All',
        summary: `${summary.updated.length} title${summary.updated.length === 1 ? '' : 's'} updated out of ${summary.checked} checked.`,
        details: [
          { label: 'Checked', after: summary.checked },
          { label: 'Updated', after: summary.updated.length },
          { label: 'Unchanged', after: summary.unchanged.length },
          { label: 'Failed', after: summary.failed.length },
        ],
        items: summary.updated.map((item) => ({
          title: item.title,
          details: item.changes.map((change) => ({
            label: change.field,
            before: change.before,
            after: change.after,
          })),
        })),
      }).catch(() => {})
    }
    const updated: number = 0
    const failed: number = 0

    if (true) {
      return
    } else if (0 > 0) {
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
        {false && (<GlassCard padding="sm">
          <div className="space-y-2">
            {/* Context indicator — shows which entry is being targeted */}
            {linkTarget ? (
              <div className="flex items-center justify-between gap-2 px-1">
                <p className="text-xs text-blue-400 truncate">
                  <span className="text-blue-400/50">Linking: </span>
                  <span className="font-medium">{linkTarget ? getDisplayTitle(linkTarget!) : ''}</span>
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
        </GlassCard>)}

        {/* ── Filter pills + Bulk Refresh ── */}
        <div className="flex items-start justify-between gap-2 flex-wrap">
          <div className="flex-1 min-w-0 space-y-2">
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

            <div className="flex items-center gap-2">
              <span className="text-xs text-white/35">Sort</span>
              <Select
                value={sortPrefs[filter] ?? DEFAULT_SORT_BY_FILTER[filter]}
                onValueChange={(value) => updateSortPreference(value as ProgressSort)}
              >
                <SelectTrigger className="h-8 w-[220px] max-w-[calc(100vw-2rem)] text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {SORT_OPTIONS_BY_FILTER[filter].map((option) => (
                    <SelectItem key={option.value} value={option.value}>
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <Button
            variant="outline"
            size="sm"
            onClick={handleBulkRefresh}
            disabled={refreshing || progressEntries.filter((e) => e.tmdbId != null).length === 0}
            className="shrink-0 text-xs border-white/10 text-white/50 hover:text-white hover:bg-white/10"
          >
            <RefreshCw className={cn('w-3.5 h-3.5 mr-1.5', refreshing && 'animate-spin')} />
            {refreshing ? `Refreshing ${refreshProgress.current} / ${refreshProgress.total}` : 'Refresh All'}
          </Button>
        </div>

        {notificationEntries && (
          <div className="rounded-xl border border-blue-500/20 bg-blue-500/10 px-3 py-2 flex items-center justify-between gap-3">
            <div className="min-w-0">
              <p className="text-xs font-semibold text-blue-300 truncate">
                {filteredLabel || 'Filtered Progress List'}
              </p>
              <p className="text-[11px] text-white/40">
                Showing {notificationEntries.length} affected title{notificationEntries.length === 1 ? '' : 's'}
              </p>
            </div>
            <Button
              variant="ghost"
              size="sm"
              className="h-7 text-xs flex-shrink-0"
              onClick={() => router.replace('/progress')}
            >
              Clear
            </Button>
          </div>
        )}

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
                      releaseStatus={entry.id ? releaseStatuses[entry.id] : undefined}
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

      <CompletionStatisticsModal
        statistics={completionStatistics}
        onClose={() => setCompletionStatistics(null)}
      />

      <Dialog
        open={repairOpen && linkTarget != null}
        onOpenChange={(open) => {
          if (!open && !linking) clearLinkTarget()
        }}
      >
        <DialogContent className="w-[calc(100vw-1.5rem)] sm:max-w-xl max-h-[85vh] overflow-visible">
          <DialogHeader>
            <DialogTitle className="text-blue-400">TMDB Repair</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="rounded-xl border border-blue-500/20 bg-blue-500/10 px-3 py-2">
              <p className="text-xs text-blue-300/70">Linking</p>
              <p className="text-sm font-semibold text-white truncate">
                {linkTarget ? getDisplayTitle(linkTarget) : ''}
              </p>
            </div>
            <div className="max-h-[60vh] overflow-y-auto pr-1">
              <TMDBSearch
                key={searchKey}
                mediaType="all"
                onSelect={handleSearchSelect}
                placeholder="Search TMDB to link or repair an entry..."
                defaultQuery={searchSeed}
              />
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={refreshSummary != null} onOpenChange={(open) => { if (!open) setRefreshSummary(null) }}>
        <DialogContent className="w-[calc(100vw-1.5rem)] sm:max-w-2xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-emerald-400">
              <RefreshCw className="w-5 h-5" />
              Refresh Complete
            </DialogTitle>
          </DialogHeader>
          {refreshSummary && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                <SummaryStat label="Checked" value={refreshSummary.checked} />
                <SummaryStat label="Updated" value={refreshSummary.updated.length} />
                <SummaryStat label="Unchanged" value={refreshSummary.unchanged.length} />
                <SummaryStat label="Failed" value={refreshSummary.failed.length} />
              </div>

              {refreshSummary.updated.length === 0 && refreshSummary.failed.length === 0 ? (
                <div className="rounded-xl border border-white/10 bg-white/5 px-3 py-4 text-center">
                  <p className="text-sm font-medium text-white">No changes found.</p>
                </div>
              ) : null}

              {refreshSummary.updated.length > 0 && (
                <div className="space-y-2">
                  <p className="text-xs font-semibold uppercase tracking-wider text-white/40">Updated Titles</p>
                  {refreshSummary.updated.map((item) => (
                    <div key={item.id} className="rounded-xl border border-white/10 bg-white/[0.03] p-3">
                      <p className="text-sm font-semibold text-white mb-2">{item.title}</p>
                      <div className="space-y-1">
                        {item.changes.map((change) => (
                          <div key={`${item.id}-${change.field}`} className="text-xs text-white/45">
                            <span className="text-white/70">{change.field}</span>
                            <span className="mx-1.5">{change.before}</span>
                            <span className="text-blue-300">→</span>
                            <span className="ml-1.5 text-white/70">{change.after}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {refreshSummary.failed.length > 0 && (
                <details className="rounded-xl border border-red-500/20 bg-red-500/10 p-3">
                  <summary className="cursor-pointer text-sm font-semibold text-red-300">
                    Failed Refreshes ({refreshSummary.failed.length})
                  </summary>
                  <div className="mt-2 space-y-2">
                    {refreshSummary.failed.map((item) => (
                      <div key={item.id} className="text-xs">
                        <p className="font-medium text-white">{item.title}</p>
                        <p className="text-red-300/70">{item.reason}</p>
                      </div>
                    ))}
                  </div>
                </details>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>

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

function SummaryStat({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-center">
      <p className="text-lg font-bold text-white">{value}</p>
      <p className="text-[10px] uppercase tracking-wider text-white/35">{label}</p>
    </div>
  )
}
