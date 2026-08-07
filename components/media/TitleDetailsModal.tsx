'use client'

import { useEffect, useMemo, useState } from 'react'
import type React from 'react'
import { Film, GitCompare, Info, Search, Star, Trash2, Tv, X } from 'lucide-react'
import { MediaEntry } from '@/types/media'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Badge } from '@/components/ui/badge'
import { TMDBPosterImage } from '@/components/common/TMDBPosterImage'
import { StatusBadge } from './StatusBadge'
import { useProgressReleaseStatuses } from '@/hooks/useProgressReleaseStatuses'
import { updateMediaEntry } from '@/lib/firebase/firestore'
import { fetchMovieMetadata, fetchTVMetadata } from '@/lib/tmdb/api'
import { useMediaStore } from '@/store/mediaStore'
import {
  formatDate,
  formatWatchHours,
  getDisplayPosterUrl,
  getDisplayTitle,
  getEffectiveMediaType,
  getEpisodesWatched,
} from '@/utils/formatters'
import { calculateEntryWatchHours } from '@/utils/watchTime'
import { MEDIA_STATUS_LABELS } from '@/types/media'

interface TitleDetailsModalProps {
  entry: MediaEntry | null
  entries: MediaEntry[]
  open: boolean
  onOpenChange: (open: boolean) => void
  onEdit: (entry: MediaEntry) => void
  onDelete: (id: string) => Promise<void> | void
}

export function TitleDetailsModal({
  entry,
  entries,
  open,
  onOpenChange,
  onEdit,
  onDelete,
}: TitleDetailsModalProps) {
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [compareOpen, setCompareOpen] = useState(false)
  const detailReleaseEntries = useMemo(() => entry ? [entry] : [], [
    entry?.id,
    entry?.status,
    entry?.tmdbId,
    entry?.type,
    entry?.seasonNumber,
    entry?.totalEpisodes,
    entry?.nextEpisodeToWatch,
    entry?.tmdbReleaseDate,
  ])
  const releaseStatuses = useProgressReleaseStatuses(detailReleaseEntries)

  useEffect(() => {
    let cancelled = false

    async function loadMissingOverview() {
      if (!open || !entry?.id || entry.tmdbId == null || entry.overview?.trim()) return

      try {
        const type = getEffectiveMediaType(entry)
        const metadata = type === 'movie'
          ? await fetchMovieMetadata(entry.tmdbId)
          : await fetchTVMetadata(entry.tmdbId)
        const overview = metadata.overview?.trim() || null
        if (!overview || cancelled) return

        await updateMediaEntry(entry.id, { overview }, { preserveOrder: true })
        const current = useMediaStore.getState().entries
        useMediaStore.getState().setEntries(
          current.map((item) => item.id === entry.id ? { ...item, overview } : item)
        )
      } catch {
        // Missing overview is non-critical; the details popup can still render stored data.
      }
    }

    loadMissingOverview()

    return () => {
      cancelled = true
    }
  }, [entry, open])

  if (!entry) return null

  const type = getEffectiveMediaType(entry)
  const watched = getEpisodesWatched(entry)
  const totalEpisodes = entry.totalEpisodes ?? (type === 'movie' ? 1 : null)
  const released = entry.id ? releaseStatuses[entry.id]?.releasedEpisodes ?? null : null
  const remaining = totalEpisodes != null ? Math.max(0, totalEpisodes - watched) : null
  const watchHours = calculateEntryWatchHours(entry)
  const showPriority = entry.status === 'planned' || entry.status === 'on_hold'
  const showRewatch = entry.status === 'completed' && (entry.rewatchCount ?? 0) > 0

  async function handleDelete() {
    if (!entry?.id) return
    await onDelete(entry.id)
    setConfirmDelete(false)
    onOpenChange(false)
  }

  return (
    <>
      <Dialog
        open={open}
        onOpenChange={(nextOpen) => {
          if (!nextOpen) {
            setConfirmDelete(false)
            setCompareOpen(false)
          }
          onOpenChange(nextOpen)
        }}
      >
        <DialogContent className="max-w-4xl overflow-hidden p-0">
          <div className="max-h-[88vh] overflow-y-auto bg-[#0b0d16] p-4 sm:p-5">
            <div className="flex gap-4">
              <PosterBlock entry={entry} />
              <div className="min-w-0 flex-1 pr-8">
                <DialogHeader className="text-left">
                  <DialogTitle className="text-xl leading-tight text-white sm:text-2xl">
                    {getDisplayTitle(entry)}
                  </DialogTitle>
                  <DialogDescription className="sr-only">
                    Stored library details, metadata, progress, notes, and actions for {getDisplayTitle(entry)}.
                  </DialogDescription>
                  {entry.nativeTitle && (
                    <p className="text-sm text-white/45">{entry.nativeTitle}</p>
                  )}
                </DialogHeader>

                <div className="mt-3 flex flex-wrap items-center gap-2 text-xs text-white/50">
                  {entry.yearMade && <span>{entry.yearMade}</span>}
                  <span>{type === 'series' ? 'TV Series' : 'Movie'}</span>
                  {entry.seasonNumber != null && type === 'series' && <span>Season {entry.seasonNumber}</span>}
                  {entry.genres.slice(0, 2).map((genre) => (
                    <span key={genre}>{genre}</span>
                  ))}
                </div>

                <div className="mt-3 flex flex-wrap items-center gap-2">
                  <StatusBadge status={entry.status} />
                  <Badge variant="outline" className="border-white/10 bg-white/5 text-white/55">
                    {type === 'series' ? 'Series' : 'Movie'}
                  </Badge>
                  {entry.country && <span className="text-xs text-white/45">{entry.country}</span>}
                  {entry.personalRating != null && (
                    <span className="inline-flex items-center gap-1 text-sm font-semibold text-amber-400">
                      <Star className="h-4 w-4 fill-amber-400" />
                      {entry.personalRating.toFixed(2)}
                    </span>
                  )}
                </div>
              </div>
            </div>

            <div className="mt-4 grid grid-cols-2 divide-x divide-white/10 overflow-hidden rounded-xl border border-white/10 bg-white/[0.035] sm:grid-cols-4">
              <MetricTile label="Episodes Watched" value={`${watched}${totalEpisodes != null ? ` / ${totalEpisodes}` : ''}`} />
              <MetricTile label="Total Episodes" value={totalEpisodes != null ? String(totalEpisodes) : '—'} />
              <MetricTile label="Episode Duration" value={entry.episodeDurationMinutes != null ? `${entry.episodeDurationMinutes} min` : '—'} />
              <MetricTile
                label="Personal Rating"
                value={entry.personalRating != null ? entry.personalRating.toFixed(2) : '—'}
                icon={entry.personalRating != null ? <Star className="h-4 w-4 fill-amber-400 text-amber-400" /> : null}
              />
            </div>

            <div className="mt-4 grid gap-4 rounded-xl border border-white/10 bg-white/[0.025] p-3 lg:grid-cols-[1.08fr_1fr_0.92fr] lg:divide-x lg:divide-white/10">
              <div className="space-y-4 lg:pr-4">
                <Section title="Overview (TMDB)" unboxed>
                  <p className="text-sm leading-relaxed text-white/68">
                    {entry.overview?.trim() || 'No overview available.'}
                  </p>
                </Section>

                <Section title="Metadata" unboxed>
                  <DetailGrid
                    compact
                    items={[
                      entry.country ? ['Country', entry.country] : null,
                      entry.id && releaseStatuses[entry.id] ? ['Release Status', releaseStatuses[entry.id].label] : null,
                      entry.tmdbId != null ? ['TMDB ID', String(entry.tmdbId)] : null,
                      entry.genres.length > 0 ? ['Genres', entry.genres.join(', ')] : null,
                      entry.ageRating ? ['Age Rating', entry.ageRating] : null,
                    ]}
                  />
                </Section>
              </div>

              <div className="space-y-4 lg:px-4">
                <Section title="Watching / Completion" unboxed>
                  <DetailGrid
                    compact
                    items={[
                      ['Status', MEDIA_STATUS_LABELS[entry.status]],
                      ['Episodes Watched', String(watched)],
                      totalEpisodes != null ? ['Total Episodes', String(totalEpisodes)] : null,
                      released != null ? ['Episodes Released', String(released)] : null,
                      remaining != null ? ['Episodes Remaining', String(remaining)] : null,
                      entry.dateFinished ? ['Date Finished', formatDate(entry.dateFinished)] : null,
                      showRewatch ? ['Rewatch Counter', String(entry.rewatchCount ?? 0)] : null,
                      entry.episodeDurationMinutes != null ? ['Episode Duration', `${entry.episodeDurationMinutes} min`] : null,
                      ['Total Watch Hours', formatWatchHours(watchHours)],
                      showPriority ? ['Priority', `${entry.priority ?? 3}/5`] : null,
                    ]}
                  />
                </Section>
              </div>

              <div className="space-y-4 lg:pl-4">
                <Section title="Personal" unboxed>
                  <div className="rounded-lg border border-white/10 bg-white/[0.035] p-3">
                    <p className="whitespace-pre-wrap text-sm leading-relaxed text-white/68">
                      {entry.specialNotes?.trim() || 'No notes.'}
                    </p>
                  </div>
                </Section>

                <Section title="Library Information" unboxed>
                  <DetailGrid
                    compact
                    items={[
                      ['ML ID', entry.internalId],
                      ['Date Added', formatDate(entry.createdAt)],
                    ]}
                  />
                </Section>
              </div>
            </div>

            {confirmDelete && (
              <div className="mt-4 rounded-xl border border-red-500/30 bg-red-500/10 p-3">
                <p className="text-sm font-medium text-red-200">
                  Delete "{getDisplayTitle(entry)}" from your library?
                </p>
                <div className="mt-3 flex flex-wrap gap-2">
                  <Button variant="outline" size="sm" onClick={() => setConfirmDelete(false)}>
                    Cancel
                  </Button>
                  <Button variant="destructive" size="sm" onClick={handleDelete}>
                    Delete Permanently
                  </Button>
                </div>
              </div>
            )}

            <DialogFooter className="mt-5 grid grid-cols-1 gap-2 sm:grid-cols-3 sm:space-x-0">
              <Button variant="outline" className="justify-center border-white/10 bg-white/[0.035]" onClick={() => setCompareOpen(true)}>
                <GitCompare className="mr-2 h-4 w-4" />
                Compare
              </Button>
              <Button
                variant="outline"
                className="justify-center border-blue-500/35 bg-blue-500/15 text-blue-100 hover:bg-blue-500/25"
                onClick={() => {
                  onEdit(entry)
                }}
              >
                Edit
              </Button>
              <Button variant="destructive" onClick={() => setConfirmDelete(true)}>
                <Trash2 className="mr-2 h-4 w-4" />
                Delete
              </Button>
            </DialogFooter>
          </div>
        </DialogContent>
      </Dialog>

      {compareOpen && (
        <CompareTitlesModal
          open={compareOpen}
          onOpenChange={setCompareOpen}
          primaryEntry={entry}
          entries={entries}
        />
      )}
    </>
  )
}

function PosterBlock({ entry }: { entry: MediaEntry }) {
  const poster = getDisplayPosterUrl(entry)
  const type = getEffectiveMediaType(entry)
  const Icon = type === 'series' ? Tv : Film

  return (
    <div className="relative h-36 w-24 flex-shrink-0 overflow-hidden rounded-xl border border-white/10 bg-white/5 sm:h-44 sm:w-28">
      {poster ? (
        <TMDBPosterImage src={poster} alt={entry.title} fill sizes="112px" className="object-cover" />
      ) : (
        <div className="flex h-full w-full items-center justify-center">
          <Icon className="h-8 w-8 text-white/25" />
        </div>
      )}
    </div>
  )
}

function MetricTile({
  label,
  value,
  icon,
}: {
  label: string
  value: string
  icon?: React.ReactNode
}) {
  return (
    <div className="flex min-h-16 flex-col items-center justify-center gap-1 px-3 py-2 text-center">
      <div className="flex items-center justify-center gap-1.5 text-sm font-semibold text-white">
        {icon}
        <span>{value}</span>
      </div>
      <p className="text-[10px] leading-tight text-white/38">{label}</p>
    </div>
  )
}

function Section({
  title,
  children,
  unboxed,
}: {
  title: string
  children: React.ReactNode
  unboxed?: boolean
}) {
  return (
    <section className={unboxed ? '' : 'mt-5'}>
      <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-white/35">{title}</h3>
      {unboxed ? children : <div className="rounded-xl border border-white/10 bg-white/[0.035] p-3">{children}</div>}
    </section>
  )
}

function DetailGrid({
  items,
  compact,
}: {
  items: Array<[string, string] | null>
  compact?: boolean
}) {
  const visible = items.filter(Boolean) as Array<[string, string]>
  if (visible.length === 0) return <p className="text-sm text-white/35">No details available.</p>
  return (
    <dl className={compact ? 'space-y-1.5' : 'grid grid-cols-1 gap-2 sm:grid-cols-2'}>
      {visible.map(([label, value]) => (
        <div
          key={label}
          className={compact ? 'grid min-w-0 grid-cols-[110px_1fr] gap-3 border-b border-white/5 pb-1.5 last:border-b-0' : 'min-w-0'}
        >
          <dt className="text-[11px] text-white/35">{label}</dt>
          <dd className={compact ? 'min-w-0 text-sm text-white/72' : 'truncate text-sm text-white/70'}>{value}</dd>
        </div>
      ))}
    </dl>
  )
}

function CompareTitlesModal({
  open,
  onOpenChange,
  primaryEntry,
  entries,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  primaryEntry: MediaEntry
  entries: MediaEntry[]
}) {
  const [selectedIds, setSelectedIds] = useState<string[]>([])
  const [query, setQuery] = useState('')
  useEffect(() => {
    setSelectedIds([])
    setQuery('')
  }, [primaryEntry.id, open])

  const selectedEntries = useMemo(() => {
    const byId = new Map(entries.filter((entry) => entry.id).map((entry) => [entry.id, entry]))
    return [primaryEntry.id, ...selectedIds]
      .filter(Boolean)
      .map((id) => byId.get(id))
      .filter(Boolean)
      .slice(0, 4) as MediaEntry[]
  }, [entries, primaryEntry.id, selectedIds])
  const releaseStatuses = useProgressReleaseStatuses(selectedEntries)
  const selectedIdSet = useMemo(
    () => new Set([primaryEntry.id, ...selectedIds].filter(Boolean)),
    [primaryEntry.id, selectedIds]
  )
  const searchResults = useMemo(() => {
    const normalized = query.trim().toLowerCase()
    if (normalized.length === 0) return []

    return entries
      .filter((entry) => {
        if (!entry.id || selectedIdSet.has(entry.id)) return false
        const haystack = [
          entry.title,
          entry.nativeTitle,
          entry.internalId,
        ].filter(Boolean).join(' ').toLowerCase()
        return haystack.includes(normalized)
      })
      .slice(0, 12)
  }, [entries, query, selectedIdSet])
  const maxSelected = selectedEntries.length >= 4

  function addSelection(id: string) {
    setSelectedIds((current) => {
      if (current.includes(id)) return current
      if (current.length >= 3) return current
      return [...current, id]
    })
  }

  function removeSelection(id: string) {
    setSelectedIds((current) => current.filter((item) => item !== id))
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-6xl overflow-hidden p-0">
        <div className="max-h-[88vh] overflow-y-auto bg-[#0b0d16] p-4 sm:p-5">
          <DialogHeader className="relative text-center">
            <DialogTitle className="text-center">Compare Titles</DialogTitle>
            <DialogDescription className="text-center">
              Search your library and compare up to 4 titles total.
            </DialogDescription>
          </DialogHeader>

          <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
            {selectedEntries.map((entry) => (
              <SelectedCompareCard
                key={entry.id ?? entry.internalId}
                entry={entry}
                locked={entry.id === primaryEntry.id}
                onRemove={() => entry.id && removeSelection(entry.id)}
              />
            ))}
          </div>
          {maxSelected && (
            <p className="mt-2 rounded-lg border border-amber-500/20 bg-amber-500/10 px-3 py-2 text-xs text-amber-200">
              Maximum of 4 titles selected.
            </p>
          )}

          <div className="mt-4 space-y-2">
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-white/30" />
              <input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Search your library to add a title..."
                className="h-10 w-full rounded-xl border border-white/10 bg-white/5 pl-10 pr-9 text-sm text-white outline-none transition-colors placeholder:text-white/30 focus:border-blue-500/40 focus:bg-white/[0.07]"
                autoFocus
              />
              {query && (
                <button
                  type="button"
                  onClick={() => setQuery('')}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-white/35 transition-colors hover:text-white/70"
                  aria-label="Clear compare search"
                >
                  <X className="h-4 w-4" />
                </button>
              )}
            </div>

            {query.trim().length > 0 && (
              <div className="max-h-72 overflow-y-auto rounded-xl border border-white/10 bg-white/[0.025] p-2">
                {searchResults.length === 0 ? (
                  <p className="px-3 py-8 text-center text-sm text-white/35">
                    No matching library titles found.
                  </p>
                ) : (
                  <div className="space-y-2">
                    {searchResults.map((entry) => (
                      <CompareSearchResult
                        key={entry.id ?? entry.internalId}
                        entry={entry}
                        disabled={maxSelected}
                        onSelect={() => entry.id && addSelection(entry.id)}
                      />
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>

          <CompareTable entries={selectedEntries} releaseStatuses={releaseStatuses} />

          <div className="mt-3 flex items-start gap-2 rounded-xl border border-white/10 bg-white/[0.035] p-3 text-xs text-white/45">
            <Info className="mt-0.5 h-4 w-4 flex-shrink-0 text-blue-300/80" />
            <p>Only key fields are shown for quick comparison. Tap a title in My List to view full details.</p>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}

function SelectedCompareCard({
  entry,
  locked,
  onRemove,
}: {
  entry: MediaEntry
  locked?: boolean
  onRemove: () => void
}) {
  return (
    <div className="relative min-w-0 rounded-xl border border-white/10 bg-white/[0.035] p-2 text-center">
      <div className="mx-auto">
        <PosterThumb entry={entry} large />
      </div>
      <div className="mt-2 min-w-0">
        <p className="truncate text-sm font-semibold text-white">{getDisplayTitle(entry)}</p>
        <p className="text-xs text-white/45">{entry.yearMade ?? 'Year unknown'}</p>
        <p className="mt-1 font-mono text-[10px] text-white/30">{entry.internalId}</p>
      </div>
      {!locked && (
        <button
          type="button"
          onClick={onRemove}
          className="absolute right-1.5 top-1.5 flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-lg bg-black/55 text-white/55 transition-colors hover:bg-white/10 hover:text-white"
          aria-label={`Remove ${getDisplayTitle(entry)} from comparison`}
        >
          <X className="h-4 w-4" />
        </button>
      )}
    </div>
  )
}

function CompareSearchResult({
  entry,
  disabled,
  onSelect,
}: {
  entry: MediaEntry
  disabled: boolean
  onSelect: () => void
}) {
  const type = getEffectiveMediaType(entry)
  return (
    <button
      type="button"
      onClick={onSelect}
      disabled={disabled}
      className="flex w-full items-center gap-3 rounded-xl border border-white/10 bg-white/[0.035] p-2.5 text-left transition-colors hover:border-white/20 hover:bg-white/[0.07] disabled:cursor-not-allowed disabled:opacity-45"
    >
      <PosterThumb entry={entry} />
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-semibold text-white">{getDisplayTitle(entry)}</p>
        <p className="mt-0.5 truncate text-xs text-white/40">
          {[entry.yearMade, entry.country, type === 'series' ? 'Series' : 'Movie'].filter(Boolean).join(' / ')}
        </p>
        <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
          <StatusBadge status={entry.status} />
          {entry.personalRating != null && (
            <span className="inline-flex items-center gap-0.5 text-xs font-semibold text-amber-400">
              <Star className="h-3 w-3 fill-amber-400" />
              {entry.personalRating.toFixed(2)}
            </span>
          )}
          <span className="font-mono text-[10px] text-white/25">{entry.internalId}</span>
        </div>
      </div>
    </button>
  )
}

function CompareTable({
  entries,
  releaseStatuses,
}: {
  entries: MediaEntry[]
  releaseStatuses: Record<string, { label: string; releasedEpisodes: number | null } | undefined>
}) {
  const rows = [
    ['Status', (entry: MediaEntry) => MEDIA_STATUS_LABELS[entry.status]],
    ['Episodes Watched', (entry: MediaEntry) => String(getEpisodesWatched(entry))],
    ['Total Episodes', (entry: MediaEntry) => formatNullableNumber(getTotalEpisodes(entry))],
    ['Episodes Released', (entry: MediaEntry) => {
      const status = entry.id ? releaseStatuses[entry.id] : undefined
      return formatNullableNumber(status?.releasedEpisodes ?? null)
    }],
    ['Episodes Remaining', (entry: MediaEntry) => {
      const total = getTotalEpisodes(entry)
      return total != null ? String(Math.max(0, total - getEpisodesWatched(entry))) : '—'
    }],
    ['Release Status', (entry: MediaEntry) => entry.id ? releaseStatuses[entry.id]?.label ?? '—' : '—'],
    ['Personal Rating', (entry: MediaEntry) => entry.personalRating != null ? entry.personalRating.toFixed(2) : '—'],
    ['Priority', (entry: MediaEntry) => entry.priority != null ? String(entry.priority) : '—'],
    ['Total Watch Hours', (entry: MediaEntry) => formatWatchHours(calculateEntryWatchHours(entry))],
    ['Remaining Watch Hours', (entry: MediaEntry) => formatRemainingWatchHours(entry)],
    ['Watch Speed Projection', () => '—'],
    ['Genres', (entry: MediaEntry) => entry.genres.length > 0 ? entry.genres.join(', ') : '—'],
    ['Country', (entry: MediaEntry) => entry.country || '—'],
    ['Year', (entry: MediaEntry) => entry.yearMade != null ? String(entry.yearMade) : '—'],
    ['Rewatch Count', (entry: MediaEntry) => String(entry.rewatchCount ?? 0)],
  ] satisfies Array<[string, (entry: MediaEntry) => string]>

  return (
    <div className="mt-4 overflow-x-auto rounded-xl border border-white/10 bg-white/[0.025]">
      <div
        className="min-w-[760px] text-sm"
        style={{ display: 'grid', gridTemplateColumns: `150px repeat(${entries.length}, minmax(140px, 1fr))` }}
      >
        <div className="border-b border-r border-white/10 bg-white/[0.04] px-3 py-2 text-xs font-semibold uppercase tracking-wider text-white/35">
          Field
        </div>
        {entries.map((entry) => (
          <div key={entry.id ?? entry.internalId} className="min-w-0 border-b border-r border-white/10 bg-white/[0.04] px-3 py-2 text-center last:border-r-0">
            <p className="truncate font-semibold text-white">{getDisplayTitle(entry)}</p>
            <p className="font-mono text-[10px] text-white/30">{entry.internalId}</p>
          </div>
        ))}

        {rows.flatMap(([label, getValue], index) => [
          <div
            key={`${label}-label`}
            className={`border-r border-white/10 px-3 py-2 text-xs text-white/45 ${index % 2 === 0 ? 'bg-white/[0.025]' : 'bg-white/[0.055]'}`}
          >
            {label}
          </div>,
          ...entries.map((entry) => (
            <div
              key={`${label}-${entry.id ?? entry.internalId}`}
              className={`min-w-0 border-r border-white/10 px-3 py-2 text-center text-xs text-white/72 last:border-r-0 ${index % 2 === 0 ? 'bg-white/[0.025]' : 'bg-white/[0.055]'}`}
            >
              <span className="line-clamp-2">{getValue(entry)}</span>
            </div>
          )),
        ])}
      </div>
    </div>
  )
}

function getTotalEpisodes(entry: MediaEntry) {
  const type = getEffectiveMediaType(entry)
  return entry.totalEpisodes ?? (type === 'movie' ? 1 : null)
}

function formatNullableNumber(value: number | null | undefined) {
  return value != null ? String(value) : '—'
}

function formatRemainingWatchHours(entry: MediaEntry) {
  const total = getTotalEpisodes(entry)
  const remainingEpisodes = total != null ? Math.max(0, total - getEpisodesWatched(entry)) : null
  const remainingHours = remainingEpisodes != null && entry.episodeDurationMinutes
    ? remainingEpisodes * entry.episodeDurationMinutes / 60
    : null
  return remainingHours != null ? formatWatchHours(remainingHours) : '—'
}

function PosterThumb({ entry, large }: { entry: MediaEntry; large?: boolean }) {
  const poster = getDisplayPosterUrl(entry)
  const Icon = getEffectiveMediaType(entry) === 'series' ? Tv : Film
  return (
    <div className={`relative flex-shrink-0 overflow-hidden rounded-lg border border-white/10 bg-white/5 ${large ? 'h-28 w-20' : 'h-16 w-11'}`}>
      {poster ? (
        <TMDBPosterImage src={poster} alt={entry.title} fill sizes={large ? '80px' : '44px'} className="object-cover" />
      ) : (
        <div className="flex h-full w-full items-center justify-center">
          <Icon className="h-4 w-4 text-white/25" />
        </div>
      )}
    </div>
  )
}
