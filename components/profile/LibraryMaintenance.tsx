'use client'

import { useMemo, useState } from 'react'
import { Timestamp } from 'firebase/firestore'
import { toast } from 'sonner'
import { Film, Link2, Loader2, RotateCcw, Search, Tv } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { TMDBPosterImage } from '@/components/common/TMDBPosterImage'
import { TMDBSearch } from '@/components/media/TMDBSearch'
import { MediaEntry, MediaEntryUpdate } from '@/types/media'
import { NormalizedTMDBResult } from '@/types/tmdb'
import { fetchMovieMetadata, fetchSeasonMetadata, fetchTVMetadata, searchMultiNormalized } from '@/lib/tmdb/api'
import { getDisplayPosterUrl, getDisplayTitle, getEffectiveMediaType } from '@/utils/formatters'

type MatchState = 'pending' | 'linked' | 'skipped' | 'unmatched'

interface MatchSuggestion {
  entry: MediaEntry
  strong: NormalizedTMDBResult | null
  possible: NormalizedTMDBResult[]
  selected?: NormalizedTMDBResult | null
  state: MatchState
  failed?: boolean
  reason?: string
}

interface LibraryMaintenanceProps {
  entries: MediaEntry[]
  editEntry: (id: string, updates: MediaEntryUpdate) => Promise<void>
}

function normalizeTitle(title: string): string {
  return title.toLowerCase().replace(/\([^)]*\)/g, '').replace(/[^a-z0-9]/g, '').trim()
}

function scoreMatch(entry: MediaEntry, result: NormalizedTMDBResult): number {
  let score = 0
  if (normalizeTitle(entry.title) === normalizeTitle(result.title)) score += 3
  if (entry.yearMade && result.year && entry.yearMade === result.year) score += 2
  if (getEffectiveMediaType(entry) === result.type) score += 2
  return score
}

function statusLabel(status: MediaEntry['status']): string {
  return status === 'on_hold' ? 'On Hold' : status.charAt(0).toUpperCase() + status.slice(1)
}

function formatCheckedAt(value?: Timestamp | null): string {
  if (!value) return 'Never'
  return value.toDate().toLocaleString('en-US', {
    month: 'long',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  })
}

export function LibraryMaintenance({ entries, editEntry }: LibraryMaintenanceProps) {
  const unmatched = useMemo(
    () => entries.filter((entry) => entry.tmdbId == null && !entry.tmdbUnmatchedDismissedAt),
    [entries]
  )
  const dismissedUnmatched = useMemo(
    () => entries.filter((entry) => entry.tmdbId == null && entry.tmdbUnmatchedDismissedAt),
    [entries]
  )
  const [searching, setSearching] = useState(false)
  const [progress, setProgress] = useState({ current: 0, total: 0 })
  const [suggestions, setSuggestions] = useState<Record<string, MatchSuggestion>>({})
  const [manualSearchId, setManualSearchId] = useState<string | null>(null)
  const [linkingId, setLinkingId] = useState<string | null>(null)
  const [summary, setSummary] = useState<{
    checked: number
    strong: number
    possible: number
    noMatch: number
    failed: number
    completedAt: Date
  } | null>(null)

  async function searchOne(entry: MediaEntry): Promise<MatchSuggestion> {
    const queries = [
      [entry.title, entry.yearMade].filter(Boolean).join(' '),
      entry.nativeTitle ? [entry.nativeTitle, entry.yearMade].filter(Boolean).join(' ') : null,
      entry.title,
    ].filter((query): query is string => Boolean(query && query.trim().length >= 2))

    const seen = new Set<string>()
    const results: NormalizedTMDBResult[] = []
    let started = false
    let failures = 0
    for (const query of queries) {
      try {
        started = true
        const found = await searchMultiNormalized(query)
        for (const item of found) {
          const key = `${item.type}-${item.tmdbId}`
          if (!seen.has(key)) {
            seen.add(key)
            results.push(item)
          }
        }
      } catch {
        failures++
      }
      if (results.length >= 5) break
    }

    const ranked = results
      .map((result) => ({ result, score: scoreMatch(entry, result) }))
      .sort((a, b) => b.score - a.score)
    const strong = ranked[0]?.score >= 5 ? ranked[0].result : null

    return {
      entry,
      strong,
      possible: ranked.map((item) => item.result).filter((item) => item !== strong).slice(0, 3),
      selected: strong ?? ranked[0]?.result ?? null,
      state: strong || ranked.length > 0 ? 'pending' : 'unmatched',
      failed: started && failures === queries.length && results.length === 0,
      reason: started && failures === queries.length && results.length === 0 ? 'TMDB search failed' : undefined,
    }
  }

  async function handleSearchAll() {
    if (unmatched.length === 0) return
    setSearching(true)
    setProgress({ current: 0, total: unmatched.length })
    const next: Record<string, MatchSuggestion> = {}
    let checked = 0

    for (let i = 0; i < unmatched.length; i++) {
      const entry = unmatched[i]
      if (!entry.id) continue
      try {
        next[entry.id] = await searchOne(entry)
      } catch (err) {
        next[entry.id] = {
          entry,
          strong: null,
          possible: [],
          state: 'unmatched',
          failed: true,
          reason: err instanceof Error ? err.message : 'TMDB search failed',
        }
      } finally {
        checked++
        await editEntry(entry.id, { tmdbLastCheckedAt: Timestamp.now() })
      }
      setSuggestions({ ...next })
      setProgress({ current: i + 1, total: unmatched.length })
    }

    setSearching(false)
    const searched = Object.values(next)
    setSummary({
      checked,
      strong: searched.filter((item) => item.strong && !item.failed).length,
      possible: searched.filter((item) => !item.strong && item.possible.length > 0 && !item.failed).length,
      noMatch: searched.filter((item) => item.state === 'unmatched' && !item.failed).length,
      failed: searched.filter((item) => item.failed).length,
      completedAt: new Date(),
    })
  }

  async function linkEntry(
    entry: MediaEntry,
    result: NormalizedTMDBResult,
    options: { skipConfirm?: boolean } = {}
  ) {
    if (!entry.id) return
    if (!options.skipConfirm && !confirm(`Link this title to "${result.title}${result.year ? ` (${result.year})` : ''}"?`)) {
      return
    }
    const duplicate = entries.find((candidate) =>
      candidate.id !== entry.id &&
      candidate.tmdbId === result.tmdbId &&
      (candidate.seasonNumber ?? null) === (entry.seasonNumber ?? null)
    )
    if (duplicate && !confirm(`"${getDisplayTitle(duplicate)}" is already linked to this TMDB title. Link anyway?`)) {
      return
    }

    setLinkingId(entry.id)
    try {
      const fullData = result.type === 'movie'
        ? await fetchMovieMetadata(result.tmdbId)
        : await fetchTVMetadata(result.tmdbId)

      const updates: MediaEntryUpdate = {
        tmdbId: fullData.tmdbId,
        type: fullData.type,
        posterUrl: fullData.posterUrl,
        backdropUrl: fullData.backdropUrl,
        country: fullData.country,
        ageRating: fullData.ageRating,
        genres: fullData.genres,
        yearMade: fullData.year ?? entry.yearMade,
        tmdbReleaseDate: fullData.releaseDate ?? null,
        tmdbUnmatchedDismissedAt: null,
      }

      if (fullData.type === 'series') {
        if (entry.seasonNumber) {
          try {
            const season = await fetchSeasonMetadata(fullData.tmdbId, entry.seasonNumber)
            if (season.posterUrl) updates.posterUrl = season.posterUrl
            if (season.year) updates.yearMade = season.year
            if (season.episodeCount) updates.totalEpisodes = season.episodeCount
            if (season.avgRuntime) updates.episodeDurationMinutes = season.avgRuntime
          } catch {
            if (fullData.totalEpisodes) updates.totalEpisodes = fullData.totalEpisodes
            if (fullData.runtime) updates.episodeDurationMinutes = fullData.runtime
          }
        } else {
          if (fullData.totalEpisodes) updates.totalEpisodes = fullData.totalEpisodes
          if (fullData.runtime) updates.episodeDurationMinutes = fullData.runtime
        }
      } else if (fullData.runtime) {
        updates.episodeDurationMinutes = fullData.runtime
      }

      await editEntry(entry.id, updates)
      setSuggestions((current) => ({
        ...current,
        [entry.id!]: {
          ...(current[entry.id!] ?? { entry, strong: result, possible: [], state: 'pending' }),
          state: 'linked',
        },
      }))
      setSummary((current) => current
        ? current
        : current)
      toast.success(`Linked "${getDisplayTitle(entry)}" to TMDB`)
    } catch {
      toast.error('Failed to link TMDB match')
    } finally {
      setLinkingId(null)
    }
  }

  async function confirmAllStrong() {
    const strongMatches = Object.values(suggestions).filter((item) => item.state === 'pending' && item.strong)
    if (
      strongMatches.length === 0 ||
      !confirm(`Link all ${strongMatches.length} strong TMDB match${strongMatches.length === 1 ? '' : 'es'}?`)
    ) {
      return
    }
    for (const item of strongMatches) {
      await linkEntry(item.entry, item.strong!, { skipConfirm: true })
    }
  }

  function previewMatch(entry: MediaEntry, result: NormalizedTMDBResult) {
    if (!entry.id) return
    setSuggestions((current) => ({
      ...current,
      [entry.id!]: {
        ...(current[entry.id!] ?? { entry, strong: null, possible: [], state: 'pending' }),
        selected: result,
        state: 'pending',
      },
    }))
  }

  async function keepUnmatched(entry: MediaEntry) {
    if (!entry.id) return
    try {
      await editEntry(entry.id, { tmdbUnmatchedDismissedAt: Timestamp.now() })
      setSuggestions((current) => {
        const next = { ...current }
        delete next[entry.id!]
        return next
      })
      toast.success(`Kept "${getDisplayTitle(entry)}" unmatched`)
    } catch {
      toast.error('Failed to keep title unmatched')
    }
  }

  async function handleRescan() {
    if (dismissedUnmatched.length === 0) return
    setSearching(true)
    try {
      for (const entry of dismissedUnmatched) {
        if (entry.id) {
          await editEntry(entry.id, { tmdbUnmatchedDismissedAt: null })
        }
      }
      setSuggestions({})
      setSummary(null)
      toast.success(`Restored ${dismissedUnmatched.length} unmatched title${dismissedUnmatched.length === 1 ? '' : 's'}`)
    } catch {
      toast.error('Failed to rescan unmatched titles')
    } finally {
      setSearching(false)
    }
  }

  function skipAll() {
    setSuggestions((current) => {
      const next = { ...current }
      Object.keys(next).forEach((id) => {
        next[id] = { ...next[id], state: 'skipped' }
      })
      return next
    })
  }

  return (
    <div className="space-y-4">
      <div>
        <h3 className="text-xs font-semibold text-white/40 uppercase tracking-wider mb-2">
          Library Maintenance
        </h3>
        <div className="rounded-xl border border-white/10 bg-white/[0.03] p-3 space-y-3">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-sm font-semibold text-white">Unmatched TMDB Titles</p>
              <p className="text-xs text-white/35 mt-0.5">
                {unmatched.length} title{unmatched.length === 1 ? '' : 's'} without a TMDB link.
              </p>
            </div>
            <div className="flex gap-2 shrink-0">
              <Button
                size="sm"
                variant="outline"
                onClick={handleSearchAll}
                disabled={searching || unmatched.length === 0}
              >
                {searching ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Search className="w-4 h-4 mr-2" />}
                {searching ? `${progress.current} / ${progress.total}` : 'Search All'}
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={handleRescan}
                disabled={searching || dismissedUnmatched.length === 0}
              >
                <RotateCcw className="w-4 h-4 mr-2" />
                Rescan
              </Button>
            </div>
          </div>

          {summary && (
            <div className="space-y-2 rounded-xl border border-blue-500/20 bg-blue-500/10 p-3">
              <div>
                <p className="text-sm font-semibold text-white">TMDB Search Complete</p>
                <p className="text-xs text-blue-300/70">
                  Completed: {summary.completedAt.toLocaleString('en-US', {
                    month: 'long',
                    day: 'numeric',
                    year: 'numeric',
                    hour: 'numeric',
                    minute: '2-digit',
                  })}
                </p>
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
                <MiniStat label="Checked" value={summary.checked} />
                <MiniStat label="Strong" value={summary.strong} />
                <MiniStat label="Possible" value={summary.possible} />
                <MiniStat label="No Match" value={summary.noMatch} />
                <MiniStat label="Failed" value={summary.failed} />
              </div>
            </div>
          )}

          {Object.values(suggestions).some((item) => item.strong && item.state === 'pending') && (
            <div className="flex gap-2 flex-wrap">
              <Button size="sm" onClick={confirmAllStrong} disabled={linkingId != null}>
                Confirm All Strong Matches
              </Button>
              <Button size="sm" variant="outline" onClick={skipAll}>
                Skip All
              </Button>
              <Button size="sm" variant="ghost" onClick={handleSearchAll} disabled={searching}>
                Retry Unmatched
              </Button>
            </div>
          )}

          <div className="space-y-2 max-h-[34rem] overflow-y-auto pr-1">
            {unmatched.length === 0 ? (
              <p className="text-sm text-white/40 py-4 text-center">No unmatched titles found.</p>
            ) : (
              unmatched.map((entry) => (
                <MaintenanceRow
                  key={entry.id}
                  entry={entry}
                  suggestion={entry.id ? suggestions[entry.id] : undefined}
                  manualSearch={manualSearchId === entry.id}
                  linking={linkingId === entry.id}
                  onLink={(result) => linkEntry(entry, result)}
                  onPreview={(result) => previewMatch(entry, result)}
                  onChooseAnother={() => setManualSearchId((current) => current === entry.id ? null : entry.id ?? null)}
                  onSkip={() => entry.id && setSuggestions((current) => ({
                    ...current,
                    [entry.id!]: {
                      ...(current[entry.id!] ?? { entry, strong: null, possible: [], state: 'pending' }),
                      state: 'skipped',
                    },
                  }))}
                  onKeepUnmatched={() => keepUnmatched(entry)}
                />
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

function MiniStat({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-lg border border-white/10 bg-white/5 px-2 py-1.5 text-center">
      <p className="text-base font-bold text-white">{value}</p>
      <p className="text-[10px] text-white/35 uppercase tracking-wider">{label}</p>
    </div>
  )
}

function MaintenanceRow({
  entry,
  suggestion,
  manualSearch,
  linking,
  onLink,
  onPreview,
  onChooseAnother,
  onSkip,
  onKeepUnmatched,
}: {
  entry: MediaEntry
  suggestion?: MatchSuggestion
  manualSearch: boolean
  linking: boolean
  onLink: (result: NormalizedTMDBResult) => void
  onPreview: (result: NormalizedTMDBResult) => void
  onChooseAnother: () => void
  onSkip: () => void
  onKeepUnmatched: () => void
}) {
  const type = getEffectiveMediaType(entry)
  const TypeIcon = type === 'movie' ? Film : Tv
  const best = suggestion?.selected ?? suggestion?.strong ?? suggestion?.possible[0] ?? null
  const bestIsStrong = Boolean(
    suggestion?.strong &&
    best &&
    suggestion.strong.tmdbId === best.tmdbId &&
    suggestion.strong.type === best.type
  )

  return (
    <div className="rounded-xl border border-white/10 bg-black/20 p-3 space-y-3">
      <div className="flex gap-3">
        <Poster src={getDisplayPosterUrl(entry)} title={entry.title} />
        <div className="flex-1 min-w-0">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <p className="text-sm font-semibold text-white truncate">{getDisplayTitle(entry)}</p>
              <p className="text-[11px] text-white/35">
                {entry.internalId} · {entry.yearMade ?? '—'} · {entry.country ?? '—'} · {statusLabel(entry.status)}
              </p>
              <p className="text-[11px] text-white/30 flex items-center gap-1 mt-0.5">
                <TypeIcon className="w-3 h-3" />
                {type === 'series' ? 'Series' : 'Movie'} · Last checked: {formatCheckedAt(entry.tmdbLastCheckedAt)}
              </p>
            </div>
            {suggestion?.state === 'linked' && (
              <span className="text-[10px] rounded-full bg-emerald-500/15 text-emerald-300 px-2 py-0.5">Linked</span>
            )}
            {suggestion?.state === 'unmatched' && (
              <span className="text-[10px] rounded-full bg-white/10 text-white/40 px-2 py-0.5">Unmatched</span>
            )}
          </div>
        </div>
      </div>

      {best && suggestion?.state === 'pending' && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          <div className="rounded-lg border border-white/10 bg-white/5 p-2">
            <p className="text-[10px] text-white/30 uppercase mb-1">Current Library</p>
            <p className="text-xs font-medium text-white truncate">{getDisplayTitle(entry)}</p>
            <p className="text-[10px] text-white/35">{entry.yearMade ?? '—'}</p>
          </div>
          <div className="rounded-lg border border-blue-500/20 bg-blue-500/10 p-2 flex gap-2">
            <Poster src={best.posterUrl} title={best.title} compact />
            <div className="min-w-0">
              <p className="text-[10px] text-blue-300/60 uppercase mb-1">
                {bestIsStrong ? 'Strong Match' : 'Possible Match'}
              </p>
              <p className="text-xs font-medium text-white truncate">{best.title}</p>
              <p className="text-[10px] text-blue-300/60">{best.type} · {best.year ?? '—'}</p>
            </div>
          </div>
        </div>
      )}

      {suggestion?.state === 'pending' && suggestion.possible.length > 1 && (
        <div className="flex gap-2 overflow-x-auto pb-1">
          {suggestion.possible.map((item) => (
            <button
              key={`${item.type}-${item.tmdbId}`}
              type="button"
              onClick={() => onPreview(item)}
              className="min-w-40 rounded-lg border border-white/10 bg-white/5 p-2 text-left hover:bg-white/10"
            >
              <p className="text-xs text-white truncate">{item.title}</p>
              <p className="text-[10px] text-white/35">{item.type} · {item.year ?? '—'}</p>
            </button>
          ))}
        </div>
      )}

      {manualSearch && (
        <TMDBSearch
          mediaType="all"
          defaultQuery={entry.title}
          onSelect={onPreview}
          placeholder="Search TMDB for this title..."
        />
      )}

      <div className="flex gap-2 flex-wrap">
        {best && suggestion?.state === 'pending' && (
          <Button size="sm" onClick={() => onLink(best)} disabled={linking}>
            {linking ? <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" /> : <Link2 className="w-3.5 h-3.5 mr-1.5" />}
            Link
          </Button>
        )}
        <Button size="sm" variant="outline" onClick={onChooseAnother}>Choose Another</Button>
        <Button size="sm" variant="ghost" onClick={onSkip}>Skip</Button>
        <Button size="sm" variant="ghost" onClick={onKeepUnmatched}>Keep Unmatched</Button>
      </div>
    </div>
  )
}

function Poster({ src, title, compact = false }: { src: string | null; title: string; compact?: boolean }) {
  return (
    <div className={`${compact ? 'w-8 h-12' : 'w-10 h-14'} relative flex-shrink-0 rounded-lg overflow-hidden bg-white/5 border border-white/10`}>
      {src ? (
        <TMDBPosterImage src={src} alt={title} fill sizes={compact ? '32px' : '40px'} className="object-cover" />
      ) : (
        <div className="w-full h-full flex items-center justify-center">
          <Film className="w-4 h-4 text-white/20" />
        </div>
      )}
    </div>
  )
}
