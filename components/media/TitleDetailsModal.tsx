'use client'

import { useEffect, useMemo, useState } from 'react'
import type React from 'react'
import { Film, GitCompare, Star, Trash2, Tv } from 'lucide-react'
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
        <DialogContent className="max-w-3xl p-0">
          <div className="max-h-[86vh] overflow-y-auto p-4 sm:p-6">
            <div className="flex gap-4">
              <PosterBlock entry={entry} />
              <div className="min-w-0 flex-1 pr-8">
                <DialogHeader className="text-left">
                  <DialogTitle className="text-xl leading-tight sm:text-2xl">
                    {getDisplayTitle(entry)}
                  </DialogTitle>
                  {entry.nativeTitle && (
                    <DialogDescription className="text-white/45">{entry.nativeTitle}</DialogDescription>
                  )}
                </DialogHeader>

                <div className="mt-3 flex flex-wrap items-center gap-2">
                  <StatusBadge status={entry.status} />
                  <Badge variant="outline">{type === 'series' ? 'Series' : 'Movie'}</Badge>
                  {entry.seasonNumber != null && type === 'series' && (
                    <Badge variant="outline">Season {entry.seasonNumber}</Badge>
                  )}
                  {entry.yearMade && <span className="text-xs text-white/45">{entry.yearMade}</span>}
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

            <Section title="Overview">
              <p className="text-sm leading-relaxed text-white/65">
                {entry.overview?.trim() || 'No overview available.'}
              </p>
            </Section>

            <Section title="Watching / Completion">
              <DetailGrid
                items={[
                  ['Status', MEDIA_STATUS_LABELS[entry.status]],
                  ['Episodes Watched', String(watched)],
                  totalEpisodes != null ? ['Total Episodes', String(totalEpisodes)] : null,
                  released != null ? ['Episodes Released', String(released)] : null,
                  remaining != null ? ['Episodes Remaining', String(remaining)] : null,
                  entry.episodeDurationMinutes != null ? ['Episode Duration', `${entry.episodeDurationMinutes} min`] : null,
                  ['Total Watch Hours', formatWatchHours(watchHours)],
                  showRewatch ? ['Rewatch Counter', String(entry.rewatchCount ?? 0)] : null,
                  showPriority ? ['Priority', `${entry.priority ?? 3}/5`] : null,
                  entry.dateFinished ? ['Date Finished', formatDate(entry.dateFinished)] : null,
                  entry.id && releaseStatuses[entry.id] ? ['Release Status', releaseStatuses[entry.id].label] : null,
                ]}
              />
            </Section>

            <Section title="Metadata">
              <DetailGrid
                items={[
                  entry.genres.length > 0 ? ['Genres', entry.genres.join(', ')] : null,
                  entry.country ? ['Country', entry.country] : null,
                  entry.yearMade ? ['Year', String(entry.yearMade)] : null,
                  entry.ageRating ? ['Age Rating', entry.ageRating] : null,
                  entry.tmdbId != null ? ['TMDB ID', String(entry.tmdbId)] : null,
                ]}
              />
            </Section>

            <Section title="Library Information">
              <DetailGrid
                items={[
                  ['ML ID', entry.internalId],
                  ['Date Added', formatDate(entry.createdAt)],
                ]}
              />
            </Section>

            {entry.specialNotes?.trim() && (
              <Section title="Personal">
                <p className="whitespace-pre-wrap text-sm leading-relaxed text-white/65">{entry.specialNotes}</p>
              </Section>
            )}

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

            <DialogFooter className="mt-5 gap-2 sm:space-x-0">
              <Button variant="outline" onClick={() => setCompareOpen(true)}>
                <GitCompare className="mr-2 h-4 w-4" />
                Compare
              </Button>
              <Button
                variant="outline"
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

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mt-5">
      <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-white/35">{title}</h3>
      <div className="rounded-xl border border-white/10 bg-white/[0.035] p-3">{children}</div>
    </section>
  )
}

function DetailGrid({ items }: { items: Array<[string, string] | null> }) {
  const visible = items.filter(Boolean) as Array<[string, string]>
  if (visible.length === 0) return <p className="text-sm text-white/35">No details available.</p>
  return (
    <dl className="grid grid-cols-1 gap-2 sm:grid-cols-2">
      {visible.map(([label, value]) => (
        <div key={label} className="min-w-0">
          <dt className="text-[11px] text-white/35">{label}</dt>
          <dd className="truncate text-sm text-white/70">{value}</dd>
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
  useEffect(() => {
    setSelectedIds([])
  }, [primaryEntry.id, open])

  const selectedEntries = useMemo(() => {
    const ids = new Set([primaryEntry.id, ...selectedIds].filter(Boolean))
    return entries.filter((entry) => entry.id && ids.has(entry.id)).slice(0, 4)
  }, [entries, primaryEntry.id, selectedIds])
  const releaseStatuses = useProgressReleaseStatuses(selectedEntries)
  const options = entries.filter((entry) => entry.id !== primaryEntry.id)

  function toggle(id: string) {
    setSelectedIds((current) => {
      if (current.includes(id)) return current.filter((item) => item !== id)
      if (current.length >= 3) return current
      return [...current, id]
    })
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-5xl">
        <DialogHeader>
          <DialogTitle>Compare Titles</DialogTitle>
          <DialogDescription>Select up to 3 more titles for comparison.</DialogDescription>
        </DialogHeader>

        <div className="max-h-24 overflow-y-auto rounded-xl border border-white/10 bg-white/[0.03] p-2">
          <div className="flex flex-wrap gap-2">
            {options.map((entry) => (
              <button
                key={entry.id}
                type="button"
                onClick={() => entry.id && toggle(entry.id)}
                className={[
                  'rounded-full border px-2.5 py-1 text-xs transition-colors',
                  selectedIds.includes(entry.id!)
                    ? 'border-blue-400/50 bg-blue-500/20 text-blue-100'
                    : 'border-white/10 bg-white/5 text-white/55 hover:bg-white/10',
                ].join(' ')}
              >
                {getDisplayTitle(entry)}
              </button>
            ))}
          </div>
        </div>

        <div className="overflow-x-auto">
          <div className="grid min-w-[720px] gap-3" style={{ gridTemplateColumns: `repeat(${selectedEntries.length}, minmax(170px, 1fr))` }}>
            {selectedEntries.map((entry) => (
              <CompareColumn
                key={entry.id}
                entry={entry}
                releaseStatus={entry.id ? releaseStatuses[entry.id] : undefined}
              />
            ))}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}

function CompareColumn({
  entry,
  releaseStatus,
}: {
  entry: MediaEntry
  releaseStatus?: { label: string; releasedEpisodes: number | null }
}) {
  const type = getEffectiveMediaType(entry)
  const watched = getEpisodesWatched(entry)
  const total = entry.totalEpisodes ?? (type === 'movie' ? 1 : null)
  const remainingEpisodes = total != null ? Math.max(0, total - watched) : null
  const remainingHours = remainingEpisodes != null && entry.episodeDurationMinutes
    ? remainingEpisodes * entry.episodeDurationMinutes / 60
    : null

  return (
    <div className="rounded-xl border border-white/10 bg-white/[0.035] p-3">
      <div className="mb-3 flex items-center gap-3">
        <PosterThumb entry={entry} />
        <div className="min-w-0">
          <h4 className="line-clamp-2 text-sm font-semibold text-white">{getDisplayTitle(entry)}</h4>
          <p className="text-xs text-white/40">{entry.yearMade ?? 'Year unknown'}</p>
        </div>
      </div>
      <DetailGrid
        items={[
          ['Status', MEDIA_STATUS_LABELS[entry.status]],
          ['Episodes Watched', String(watched)],
          total != null ? ['Total Episodes', String(total)] : null,
          releaseStatus?.releasedEpisodes != null ? ['Episodes Released', String(releaseStatus.releasedEpisodes)] : null,
          remainingEpisodes != null ? ['Episodes Remaining', String(remainingEpisodes)] : null,
          releaseStatus ? ['Release Status', releaseStatus.label] : null,
          entry.personalRating != null ? ['Personal Rating', entry.personalRating.toFixed(2)] : null,
          entry.priority != null ? ['Priority', `${entry.priority}/5`] : null,
          ['Total Watch Hours', formatWatchHours(calculateEntryWatchHours(entry))],
          remainingHours != null ? ['Remaining Watch Hours', formatWatchHours(remainingHours)] : null,
          entry.episodeDurationMinutes != null ? ['Episode Duration', `${entry.episodeDurationMinutes} min`] : null,
          entry.genres.length > 0 ? ['Genres', entry.genres.join(', ')] : null,
          entry.country ? ['Country', entry.country] : null,
          entry.rewatchCount ? ['Rewatch Counter', String(entry.rewatchCount)] : null,
        ]}
      />
    </div>
  )
}

function PosterThumb({ entry }: { entry: MediaEntry }) {
  const poster = getDisplayPosterUrl(entry)
  const Icon = getEffectiveMediaType(entry) === 'series' ? Tv : Film
  return (
    <div className="relative h-16 w-11 flex-shrink-0 overflow-hidden rounded-lg border border-white/10 bg-white/5">
      {poster ? (
        <TMDBPosterImage src={poster} alt={entry.title} fill sizes="44px" className="object-cover" />
      ) : (
        <div className="flex h-full w-full items-center justify-center">
          <Icon className="h-4 w-4 text-white/25" />
        </div>
      )}
    </div>
  )
}
