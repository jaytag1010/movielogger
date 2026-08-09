'use client'

import { useEffect, useMemo, useState } from 'react'
import { Clock, Film, Play, Shuffle, Sparkles, Tv } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { TMDBPosterImage } from '@/components/common/TMDBPosterImage'
import { ProgressReleaseStatus } from '@/hooks/useProgressReleaseStatuses'
import { MediaEntry } from '@/types/media'
import {
  formatWatchHours,
  getDisplayPosterUrl,
  getDisplayTitle,
  getEffectiveMediaType,
} from '@/utils/formatters'
import { compareDateAdded, compareDateAddedDesc } from '@/utils/internalIdSort'
import { getPriorityDisplay, normalizePriority } from '@/utils/priority'
import { calculateEntryWatchHours } from '@/utils/watchTime'

type RecommendationMode =
  | 'smart'
  | 'priority'
  | 'quick'
  | 'short'
  | 'ready'
  | 'recent'
  | 'waiting'
  | 'surprise'

type TimeFilter = 'any' | 'under2' | '2to5' | '5to10' | '10plus'

interface WatchNextModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  plannedEntries: MediaEntry[]
  releaseStatuses: Record<string, ProgressReleaseStatus | undefined>
  onStartWatching: (entry: MediaEntry) => Promise<void>
}

interface Recommendation {
  entry: MediaEntry
  why: string
}

const MODE_OPTIONS: { value: RecommendationMode; label: string }[] = [
  { value: 'smart', label: 'Smart Pick' },
  { value: 'priority', label: 'Highest Priority' },
  { value: 'quick', label: 'Quick Watch' },
  { value: 'short', label: 'Short Series / Movie' },
  { value: 'ready', label: 'Ready to Binge' },
  { value: 'recent', label: 'Recently Added' },
  { value: 'waiting', label: 'Longest Waiting' },
  { value: 'surprise', label: 'Surprise Me' },
]

const TIME_OPTIONS: { value: TimeFilter; label: string }[] = [
  { value: 'any', label: 'Any' },
  { value: 'under2', label: '< 2 hours' },
  { value: '2to5', label: '2-5 hours' },
  { value: '5to10', label: '5-10 hours' },
  { value: '10plus', label: '10+ hours' },
]

function watchHours(entry: MediaEntry): number | null {
  const hours = calculateEntryWatchHours(entry)
  return hours > 0 ? hours : null
}

function fitsTimeFilter(entry: MediaEntry, filter: TimeFilter): boolean {
  if (filter === 'any') return true
  const hours = watchHours(entry)
  if (hours == null) return false
  if (filter === 'under2') return hours < 2
  if (filter === '2to5') return hours >= 2 && hours <= 5
  if (filter === '5to10') return hours > 5 && hours <= 10
  return hours > 10
}

function monthsWaiting(entry: MediaEntry): number {
  const created = entry.createdAt?.toMillis?.() ?? 0
  if (created <= 0) return 0
  return Math.max(0, (Date.now() - created) / (1000 * 60 * 60 * 24 * 30))
}

function waitingText(entry: MediaEntry): string {
  const created = entry.createdAt?.toDate?.()
  if (!created) return 'Date added unavailable'
  const days = Math.max(0, Math.floor((Date.now() - created.getTime()) / (1000 * 60 * 60 * 24)))
  if (days < 30) return `${days} day${days === 1 ? '' : 's'} in Planned`
  const months = Math.floor(days / 30)
  if (months < 12) return `${months} month${months === 1 ? '' : 's'} in Planned`
  const years = Math.floor(months / 12)
  return `${years} year${years === 1 ? '' : 's'} in Planned`
}

function isReady(entry: MediaEntry, statuses: Record<string, ProgressReleaseStatus | undefined>): boolean {
  return entry.id ? statuses[entry.id]?.releaseRank === 3 : false
}

function randomFrom<T>(items: T[]): T | null {
  if (items.length === 0) return null
  return items[Math.floor(Math.random() * items.length)]
}

function avoidShown(entries: MediaEntry[], shownIds: Set<string>): MediaEntry[] {
  const unseen = entries.filter((entry) => entry.id && !shownIds.has(entry.id))
  return unseen.length > 0 ? unseen : entries
}

function shortestValue(entry: MediaEntry): number | null {
  const type = getEffectiveMediaType(entry)
  if (type === 'series') return entry.totalEpisodes != null && entry.totalEpisodes > 0 ? entry.totalEpisodes : null
  return watchHours(entry)
}

function buildRecommendation(
  entries: MediaEntry[],
  statuses: Record<string, ProgressReleaseStatus | undefined>,
  mode: RecommendationMode,
  timeFilter: TimeFilter,
  shownIds: Set<string>
): Recommendation | null {
  const eligible = entries.filter((entry) => fitsTimeFilter(entry, timeFilter))
  if (eligible.length === 0) return null

  const pool = avoidShown(eligible, shownIds)

  if (mode === 'surprise') {
    const entry = randomFrom(pool)
    return entry ? { entry, why: 'Randomly selected from your Planned titles.' } : null
  }

  if (mode === 'ready') {
    const ready = avoidShown(eligible.filter((entry) => isReady(entry, statuses)), shownIds)
    const entry = randomFrom(ready)
    return entry ? { entry, why: 'All episodes or the movie release are already available.' } : null
  }

  if (mode === 'priority') {
    const maxPriority = Math.max(...pool.map((entry) => normalizePriority(entry.priority)))
    const top = pool.filter((entry) => normalizePriority(entry.priority) === maxPriority)
    const entry = randomFrom(top)
    return entry ? { entry, why: `This is one of your Priority ${maxPriority} titles.` } : null
  }

  if (mode === 'quick') {
    const known = pool.filter((entry) => watchHours(entry) != null)
    known.sort((a, b) => (watchHours(a) ?? Infinity) - (watchHours(b) ?? Infinity))
    const shortlist = known.slice(0, Math.min(4, known.length))
    const entry = randomFrom(shortlist)
    return entry ? { entry, why: `One of the shortest titles in your Planned library at ${formatWatchHours(watchHours(entry))}.` } : null
  }

  if (mode === 'short') {
    const known = pool.filter((entry) => shortestValue(entry) != null)
    known.sort((a, b) => (shortestValue(a) ?? Infinity) - (shortestValue(b) ?? Infinity))
    const entry = randomFrom(known.slice(0, Math.min(4, known.length)))
    if (!entry) return null
    const type = getEffectiveMediaType(entry)
    const why = type === 'series'
      ? `One of the shortest series options at ${entry.totalEpisodes} episode${entry.totalEpisodes === 1 ? '' : 's'}.`
      : `One of the shortest movie options at ${formatWatchHours(watchHours(entry))}.`
    return { entry, why }
  }

  if (mode === 'recent') {
    const sorted = [...pool].sort(compareDateAddedDesc)
    const entry = randomFrom(sorted.slice(0, Math.min(4, sorted.length)))
    return entry ? { entry, why: 'One of your most recently added Planned titles.' } : null
  }

  if (mode === 'waiting') {
    const sorted = [...pool].sort(compareDateAdded)
    const entry = randomFrom(sorted.slice(0, Math.min(4, sorted.length)))
    return entry ? { entry, why: `This has been waiting in Planned for ${waitingText(entry).replace(' in Planned', '')}.` } : null
  }

  const scored = pool.map((entry) => {
    const priority = normalizePriority(entry.priority)
    const hours = watchHours(entry)
    const release = entry.id ? statuses[entry.id] : undefined
    let score = priority * 30
    if (release?.releaseRank === 3) score += 18
    if (release?.releaseRank === 2) score += 6
    if (release?.releaseRank === 1) score -= 4
    score += Math.min(18, monthsWaiting(entry) * 1.5)
    if (hours != null) {
      if (hours < 2) score += 6
      else if (hours <= 5) score += 4
      else if (hours <= 10) score += 2
      else if (hours > 30) score -= 2
      if (timeFilter !== 'any') score += 15
    } else if (timeFilter !== 'any') {
      score -= 3
    }
    score += Math.random() * 4
    return { entry, score }
  }).sort((a, b) => b.score - a.score)

  const top = scored.slice(0, Math.min(4, scored.length))
  const picked = randomFrom(top)
  if (!picked) return null

  const reasons = [`Priority ${normalizePriority(picked.entry.priority)}`]
  if (isReady(picked.entry, statuses)) reasons.push('ready to binge')
  if (monthsWaiting(picked.entry) >= 1) reasons.push(`waiting ${waitingText(picked.entry).replace(' in Planned', '')}`)
  const hours = watchHours(picked.entry)
  if (hours != null && timeFilter !== 'any') reasons.push(`fits ${TIME_OPTIONS.find((option) => option.value === timeFilter)?.label}`)

  return {
    entry: picked.entry,
    why: `${reasons.join(', ')}.`,
  }
}

export function WatchNextModal({
  open,
  onOpenChange,
  plannedEntries,
  releaseStatuses,
  onStartWatching,
}: WatchNextModalProps) {
  const [mode, setMode] = useState<RecommendationMode>('smart')
  const [timeFilter, setTimeFilter] = useState<TimeFilter>('any')
  const [shownIds, setShownIds] = useState<Set<string>>(new Set())
  const [recommendation, setRecommendation] = useState<Recommendation | null>(null)
  const [confirming, setConfirming] = useState(false)
  const [starting, setStarting] = useState(false)

  const eligibleCount = useMemo(
    () => plannedEntries.filter((entry) => fitsTimeFilter(entry, timeFilter)).length,
    [plannedEntries, timeFilter]
  )

  function pickNext(nextMode = mode, nextTimeFilter = timeFilter, resetShown = false) {
    const shown = resetShown ? new Set<string>() : shownIds
    const next = buildRecommendation(plannedEntries, releaseStatuses, nextMode, nextTimeFilter, shown)
    setRecommendation(next)
    setConfirming(false)
    if (next?.entry.id) {
      setShownIds((current) => {
        const base = resetShown ? new Set<string>() : new Set(current)
        const eligible = plannedEntries.filter((entry) => fitsTimeFilter(entry, nextTimeFilter))
        if (base.size >= eligible.length && eligible.length > 0) base.clear()
        base.add(next.entry.id!)
        return base
      })
    }
  }

  function handleModeChange(value: RecommendationMode) {
    setMode(value)
    setShownIds(new Set())
    pickNext(value, timeFilter, true)
  }

  function handleTimeChange(value: TimeFilter) {
    setTimeFilter(value)
    setShownIds(new Set())
    pickNext(mode, value, true)
  }

  async function handleStartWatching() {
    if (!recommendation?.entry) return
    setStarting(true)
    try {
      await onStartWatching(recommendation.entry)
      setConfirming(false)
      onOpenChange(false)
    } catch {
      // The caller owns user-facing error messaging because it uses the normal
      // media update workflow.
    } finally {
      setStarting(false)
    }
  }

  const entry = recommendation?.entry ?? null
  const priority = entry ? getPriorityDisplay(entry.priority) : null
  const releaseStatus = entry?.id ? releaseStatuses[entry.id] : undefined
  const poster = entry ? getDisplayPosterUrl(entry) : null
  const TypeIcon = entry && getEffectiveMediaType(entry) === 'series' ? Tv : Film
  const hours = entry ? watchHours(entry) : null
  const why = recommendation?.why ?? ''

  useEffect(() => {
    if (!open) {
      setConfirming(false)
      return
    }
    if (!recommendation && plannedEntries.length > 0) {
      pickNext(mode, timeFilter, true)
    }
    // pickNext intentionally stays outside the dependency list; it depends on
    // session state and should run only when the modal opens or entries arrive.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, plannedEntries.length])

  return (
    <Dialog open={open} onOpenChange={(next) => {
      onOpenChange(next)
      if (!next) setConfirming(false)
    }}>
      <DialogContent className="max-w-lg p-0 overflow-hidden">
        <div className="max-h-[88vh] overflow-y-auto p-4 sm:p-5">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-white">
              <Sparkles className="h-5 w-5 text-purple-300" />
              What to Watch Next?
            </DialogTitle>
          </DialogHeader>

          <div className="mt-4 grid grid-cols-1 gap-2 sm:grid-cols-2">
            <div className="space-y-1.5">
              <p className="text-xs text-white/40">Mode</p>
              <Select value={mode} onValueChange={(value) => handleModeChange(value as RecommendationMode)}>
                <SelectTrigger className="h-9 text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {MODE_OPTIONS.map((option) => (
                    <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <p className="text-xs text-white/40">Available Time</p>
              <Select value={timeFilter} onValueChange={(value) => handleTimeChange(value as TimeFilter)}>
                <SelectTrigger className="h-9 text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {TIME_OPTIONS.map((option) => (
                    <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {plannedEntries.length === 0 ? (
            <EmptyState message="You don't have any Planned titles to recommend yet." />
          ) : !entry ? (
            <div className="mt-4 space-y-3">
              <EmptyState
                message={mode === 'ready'
                  ? 'No Planned titles are currently ready to binge.'
                  : eligibleCount === 0
                    ? 'No Planned titles match the selected watch time.'
                    : 'No recommendation is available for the selected mode.'}
              />
              <Button className="w-full" onClick={() => pickNext()}>
                Try Again
              </Button>
            </div>
          ) : (
            <div className="mt-4 rounded-2xl border border-white/10 bg-white/[0.035] p-3">
              <p className="mb-3 text-sm font-semibold text-purple-200">Tonight&apos;s Pick</p>
              <div className="flex gap-3">
                <div className="relative h-32 w-24 flex-shrink-0 overflow-hidden rounded-xl border border-white/10 bg-white/5">
                  {poster ? (
                    <TMDBPosterImage src={poster} alt={entry.title} fill sizes="88px" className="object-cover" />
                  ) : (
                    <div className="flex h-full w-full items-center justify-center">
                      <TypeIcon className="h-7 w-7 text-white/25" />
                    </div>
                  )}
                </div>
                <div className="min-w-0 flex-1">
                  <h3 className="text-base font-semibold leading-tight text-white">{getDisplayTitle(entry)}</h3>
                  <p className="mt-1 text-xs text-white/45">
                    {[getEffectiveMediaType(entry) === 'series' ? 'Series' : 'Movie', entry.yearMade, entry.country].filter(Boolean).join(' · ')}
                  </p>
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {priority && (
                      <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-semibold ${priority.tone}`}>
                        Priority {priority.filled}<span className="text-white/25">{priority.empty}</span>
                      </span>
                    )}
                    {releaseStatus && (
                      <span className="inline-flex items-center rounded-full border border-white/10 bg-white/5 px-2 py-0.5 text-[10px] text-white/55">
                        {releaseStatus.label}
                      </span>
                    )}
                  </div>
                  <div className="mt-3 grid grid-cols-2 gap-2 text-xs">
                    <InfoTile label="Episodes" value={entry.totalEpisodes != null ? String(entry.totalEpisodes) : '—'} />
                    <InfoTile label="Watch Hours" value={hours != null ? formatWatchHours(hours) : '—'} />
                    <InfoTile label="Duration" value={entry.episodeDurationMinutes != null ? `${entry.episodeDurationMinutes} min` : '—'} />
                    <InfoTile label="Waiting" value={waitingText(entry)} />
                  </div>
                </div>
              </div>

              <div className="mt-4 rounded-xl border border-blue-500/20 bg-blue-500/10 p-3">
                <p className="text-xs font-semibold text-blue-200">Why this pick?</p>
                <p className="mt-1 text-sm leading-relaxed text-white/65">{why}</p>
              </div>

              {confirming && (
                <div className="mt-3 rounded-xl border border-emerald-500/25 bg-emerald-500/10 p-3">
                  <p className="text-sm font-medium text-white">Start watching &quot;{getDisplayTitle(entry)}&quot;?</p>
                  <div className="mt-3 flex gap-2">
                    <Button variant="outline" size="sm" className="flex-1" onClick={() => setConfirming(false)} disabled={starting}>
                      Cancel
                    </Button>
                    <Button size="sm" className="flex-1 bg-emerald-600 text-white hover:bg-emerald-700" onClick={handleStartWatching} disabled={starting}>
                      {starting ? 'Starting...' : 'Start Watching'}
                    </Button>
                  </div>
                </div>
              )}

              <div className="mt-4 grid grid-cols-1 gap-2 sm:grid-cols-2">
                <Button onClick={() => setConfirming(true)} className="bg-emerald-600 text-white hover:bg-emerald-700">
                  <Play className="mr-2 h-4 w-4" />
                  Start Watching
                </Button>
                <Button variant="outline" onClick={() => pickNext()}>
                  <Shuffle className="mr-2 h-4 w-4" />
                  Pick Another
                </Button>
              </div>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}

function EmptyState({ message }: { message: string }) {
  return (
    <div className="mt-4 rounded-xl border border-white/10 bg-white/[0.035] px-4 py-8 text-center">
      <Sparkles className="mx-auto h-6 w-6 text-white/25" />
      <p className="mt-2 text-sm text-white/45">{message}</p>
    </div>
  )
}

function InfoTile({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-white/10 bg-black/10 px-2 py-1.5">
      <p className="flex items-center gap-1 text-[10px] uppercase tracking-wider text-white/30">
        {label === 'Watch Hours' && <Clock className="h-3 w-3" />}
        {label}
      </p>
      <p className="mt-0.5 truncate text-xs font-semibold text-white/70">{value}</p>
    </div>
  )
}
