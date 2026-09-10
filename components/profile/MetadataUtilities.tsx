'use client'

import { useEffect, useMemo, useState } from 'react'
import { toast } from 'sonner'
import { Clapperboard, FileText, Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { MediaEntry, MediaEntryUpdate } from '@/types/media'
import { fetchMovieMetadata, fetchTVMetadata } from '@/lib/tmdb/api'
import { getDisplayTitle, getEffectiveMediaType } from '@/utils/formatters'

interface MetadataUtilitiesProps {
  entries: MediaEntry[]
  editEntry: (id: string, updates: MediaEntryUpdate) => Promise<void>
  refreshEntry: (id: string, updates: MediaEntryUpdate) => Promise<void>
}

interface OverviewSummary {
  checked: number
  missingFound: number
  added: number
  unavailable: number
  failed: number
}

interface ShortsSummary {
  candidates: number
  converted: number
  skipped: number
  failed: number
}

function isShortsCandidate(entry: MediaEntry): boolean {
  const duration = Number(entry.episodeDurationMinutes)
  const totalEpisodes = Number(entry.totalEpisodes)
  return (
    entry.id != null &&
    entry.type === 'series' &&
    Number.isFinite(duration) &&
    duration > 0 &&
    duration < 15 &&
    Number.isFinite(totalEpisodes) &&
    totalEpisodes > 1
  )
}

function formatMinutes(value?: number | null): string {
  if (value == null || !Number.isFinite(Number(value))) return 'Unknown'
  return `${Number(value).toFixed(1)} min`
}

export function MetadataUtilities({ entries, editEntry, refreshEntry }: MetadataUtilitiesProps) {
  const [running, setRunning] = useState(false)
  const [progress, setProgress] = useState({ current: 0, total: 0 })
  const [summary, setSummary] = useState<OverviewSummary | null>(null)
  const [shortsRunning, setShortsRunning] = useState(false)
  const [shortsProgress, setShortsProgress] = useState({ current: 0, total: 0 })
  const [selectedShortsIds, setSelectedShortsIds] = useState<Set<string>>(new Set())
  const [shortsSummary, setShortsSummary] = useState<ShortsSummary | null>(null)

  const candidates = useMemo(
    () => entries.filter((entry) => entry.id && entry.tmdbId != null && !entry.overview?.trim()),
    [entries]
  )
  const shortsCandidates = useMemo(
    () => entries.filter(isShortsCandidate),
    [entries]
  )
  const shortsCandidateKey = useMemo(
    () => shortsCandidates.map((entry) => entry.id).filter(Boolean).join('|'),
    [shortsCandidates]
  )
  const selectedShortsCount = selectedShortsIds.size
  const percent = progress.total > 0 ? Math.round(progress.current / progress.total * 100) : 0
  const shortsPercent = shortsProgress.total > 0 ? Math.round(shortsProgress.current / shortsProgress.total * 100) : 0

  useEffect(() => {
    setSelectedShortsIds(new Set(shortsCandidates.map((entry) => entry.id!).filter(Boolean)))
  }, [shortsCandidateKey, shortsCandidates])

  async function handleFillMissingOverviews() {
    const currentCandidates = entries.filter((entry) => entry.id && entry.tmdbId != null && !entry.overview?.trim())
    if (currentCandidates.length === 0) {
      const emptySummary = { checked: 0, missingFound: 0, added: 0, unavailable: 0, failed: 0 }
      setSummary(emptySummary)
      toast.success('All TMDB-linked titles already have overviews')
      return
    }

    setRunning(true)
    setProgress({ current: 0, total: currentCandidates.length })
    setSummary(null)

    let added = 0
    let unavailable = 0
    let failed = 0

    for (let i = 0; i < currentCandidates.length; i++) {
      const entry = currentCandidates[i]
      setProgress({ current: i + 1, total: currentCandidates.length })

      try {
        if (!entry.id || entry.tmdbId == null) {
          unavailable += 1
          continue
        }

        const type = getEffectiveMediaType(entry)
        const metadata = type === 'movie'
          ? await fetchMovieMetadata(entry.tmdbId)
          : await fetchTVMetadata(entry.tmdbId)
        const overview = metadata.overview?.trim() || null

        if (!overview) {
          unavailable += 1
          continue
        }

        await refreshEntry(entry.id, { overview })
        added += 1
      } catch {
        failed += 1
      }
    }

    const nextSummary = {
      checked: currentCandidates.length,
      missingFound: currentCandidates.length,
      added,
      unavailable,
      failed,
    }
    setSummary(nextSummary)
    setRunning(false)

    if (added > 0) {
      toast.success(`Added ${added} overview${added === 1 ? '' : 's'}`)
    } else {
      toast.info('No new overviews available from TMDB')
    }
  }

  async function handleConvertSelectedShorts() {
    const selected = shortsCandidates.filter((entry) => entry.id && selectedShortsIds.has(entry.id))
    if (selected.length === 0) return

    setShortsRunning(true)
    setShortsProgress({ current: 0, total: selected.length })
    setShortsSummary(null)

    let converted = 0
    let failed = 0
    for (let i = 0; i < selected.length; i++) {
      const entry = selected[i]
      try {
        await editEntry(entry.id!, { type: 'shorts' })
        converted += 1
      } catch {
        failed += 1
      } finally {
        setShortsProgress({ current: i + 1, total: selected.length })
      }
    }

    const nextSummary = {
      candidates: shortsCandidates.length,
      converted,
      skipped: shortsCandidates.length - selected.length,
      failed,
    }
    setShortsSummary(nextSummary)
    setShortsRunning(false)

    if (converted > 0) {
      toast.success(`Converted ${converted} title${converted === 1 ? '' : 's'} to Shorts`)
    } else {
      toast.error('No titles were converted to Shorts')
    }
  }

  return (
    <div className="space-y-3">
      <div>
        <h3 className="text-xs font-semibold text-white/40 uppercase tracking-wider mb-2">
          Metadata Utilities
        </h3>
        <div className="rounded-xl border border-white/10 bg-white/[0.03] p-3">
          <div className="flex items-start justify-between gap-3">
            <div className="flex min-w-0 items-start gap-3">
              <div className="w-9 h-9 rounded-lg bg-amber-500/15 border border-amber-500/20 flex items-center justify-center shrink-0">
                {running ? (
                  <Loader2 className="w-4 h-4 text-amber-300 animate-spin" />
                ) : (
                  <FileText className="w-4 h-4 text-amber-300" />
                )}
              </div>
              <div className="min-w-0">
                <p className="text-sm font-semibold text-white">Fill Missing Overviews</p>
                <p className="text-xs text-white/40 mt-1">
                  {running
                    ? `Checking ${progress.current} / ${progress.total} (${percent}%)`
                    : `${candidates.length} TMDB-linked title${candidates.length === 1 ? '' : 's'} missing overview`}
                </p>
                <p className="text-[11px] text-white/30 mt-0.5">
                  Checks only TMDB-linked titles with blank overviews. Existing overviews and personal notes are unchanged.
                </p>
              </div>
            </div>
            <Button
              size="sm"
              onClick={handleFillMissingOverviews}
              disabled={running || candidates.length === 0}
            >
              {running ? 'Checking...' : 'Fill Missing'}
            </Button>
          </div>

          {(running || summary) && (
            <div className="mt-3 space-y-2">
              {progress.total > 0 && (
                <div className="h-2 overflow-hidden rounded-full bg-white/10">
                  <div
                    className="h-full rounded-full bg-amber-400 transition-all"
                    style={{ width: `${percent}%` }}
                  />
                </div>
              )}
              {summary && (
                <div className="rounded-lg border border-amber-500/20 bg-amber-500/10 p-3">
                  <p className="text-sm font-semibold text-white">Overview Check Complete</p>
                  <div className="mt-2 grid grid-cols-2 gap-2 text-xs sm:grid-cols-5">
                    <SummaryItem label="Checked" value={summary.checked} />
                    <SummaryItem label="Missing" value={summary.missingFound} />
                    <SummaryItem label="Added" value={summary.added} />
                    <SummaryItem label="Unavailable" value={summary.unavailable} />
                    <SummaryItem label="Failed" value={summary.failed} />
                  </div>
                </div>
              )}
            </div>
          )}

          {!running && candidates.length > 0 && (
            <div className="mt-3 max-h-40 overflow-y-auto rounded-lg border border-white/10 bg-black/10 p-2">
              {candidates.slice(0, 20).map((entry) => (
                <p key={entry.id ?? entry.internalId} className="truncate text-xs text-white/35">
                  {getDisplayTitle(entry)}
                </p>
              ))}
              {candidates.length > 20 && (
                <p className="mt-1 text-xs text-white/25">+{candidates.length - 20} more</p>
              )}
            </div>
          )}
        </div>

        <div className="mt-3 rounded-xl border border-cyan-500/20 bg-cyan-500/[0.06] p-3">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div className="flex min-w-0 items-start gap-3">
              <div className="w-9 h-9 rounded-lg bg-cyan-500/15 border border-cyan-500/25 flex items-center justify-center shrink-0">
                {shortsRunning ? (
                  <Loader2 className="w-4 h-4 text-cyan-300 animate-spin" />
                ) : (
                  <Clapperboard className="w-4 h-4 text-cyan-300" />
                )}
              </div>
              <div className="min-w-0">
                <p className="text-sm font-semibold text-white">Convert Series to Shorts</p>
                <p className="text-xs text-white/45 mt-1">
                  {shortsRunning
                    ? `Converting ${shortsProgress.current} / ${shortsProgress.total} (${shortsPercent}%)`
                    : `${shortsCandidates.length} candidate${shortsCandidates.length === 1 ? '' : 's'} found`}
                </p>
                <p className="text-[11px] text-white/30 mt-0.5">
                  Finds Series with more than 1 episode and episode duration below 15 minutes. Only the Type field changes.
                </p>
              </div>
            </div>
            <div className="flex flex-wrap gap-2 sm:justify-end">
              <Button
                type="button"
                size="sm"
                variant="outline"
                disabled={shortsRunning || shortsCandidates.length === 0}
                onClick={() => setSelectedShortsIds(new Set(shortsCandidates.map((entry) => entry.id!).filter(Boolean)))}
              >
                Select All
              </Button>
              <Button
                type="button"
                size="sm"
                variant="outline"
                disabled={shortsRunning || selectedShortsCount === 0}
                onClick={() => setSelectedShortsIds(new Set())}
              >
                Deselect
              </Button>
              <Button
                type="button"
                size="sm"
                disabled={shortsRunning || selectedShortsCount === 0}
                onClick={handleConvertSelectedShorts}
              >
                {shortsRunning ? 'Converting...' : `Convert Selected (${selectedShortsCount})`}
              </Button>
            </div>
          </div>

          {(shortsRunning || shortsSummary) && (
            <div className="mt-3 space-y-2">
              {shortsProgress.total > 0 && (
                <div className="h-2 overflow-hidden rounded-full bg-white/10">
                  <div
                    className="h-full rounded-full bg-cyan-400 transition-all"
                    style={{ width: `${shortsPercent}%` }}
                  />
                </div>
              )}
              {shortsSummary && (
                <div className="rounded-lg border border-cyan-500/20 bg-cyan-500/10 p-3">
                  <p className="text-sm font-semibold text-white">Shorts Conversion Complete</p>
                  <div className="mt-2 grid grid-cols-2 gap-2 text-xs sm:grid-cols-4">
                    <SummaryItem label="Candidates" value={shortsSummary.candidates} />
                    <SummaryItem label="Converted" value={shortsSummary.converted} />
                    <SummaryItem label="Skipped" value={shortsSummary.skipped} />
                    <SummaryItem label="Failed" value={shortsSummary.failed} />
                  </div>
                </div>
              )}
            </div>
          )}

          {!shortsRunning && shortsCandidates.length > 0 && (
            <div className="mt-3 max-h-72 overflow-y-auto rounded-lg border border-white/10 bg-black/10">
              {shortsCandidates.map((entry) => {
                const id = entry.id!
                const checked = selectedShortsIds.has(id)
                return (
                  <label
                    key={id}
                    className="flex cursor-pointer items-start gap-3 border-b border-white/5 px-3 py-2 last:border-b-0 hover:bg-white/[0.03]"
                  >
                    <input
                      type="checkbox"
                      className="mt-1 h-4 w-4 accent-cyan-400"
                      checked={checked}
                      onChange={(event) => {
                        setSelectedShortsIds((current) => {
                          const next = new Set(current)
                          if (event.target.checked) next.add(id)
                          else next.delete(id)
                          return next
                        })
                      }}
                    />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium text-white">{getDisplayTitle(entry)}</p>
                      <p className="mt-0.5 text-xs text-white/45">
                        {entry.totalEpisodes ?? '?'} episodes · {formatMinutes(entry.episodeDurationMinutes)} · {entry.yearMade ?? 'Unknown year'}
                      </p>
                      <p className="mt-0.5 text-[11px] text-white/30">
                        {entry.country || 'Unknown country'} · {entry.status.replace('_', ' ')} · {entry.internalId || 'No ML ID'}
                      </p>
                    </div>
                  </label>
                )
              })}
            </div>
          )}

          {!shortsRunning && shortsCandidates.length === 0 && (
            <div className="mt-3 rounded-lg border border-white/10 bg-white/[0.03] px-3 py-2 text-xs text-white/40">
              No Series entries currently meet the Shorts candidate rule.
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

function SummaryItem({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-lg border border-white/10 bg-white/5 px-2 py-1.5 text-center">
      <p className="text-base font-bold text-white">{value}</p>
      <p className="text-[10px] text-white/35 uppercase tracking-wider">{label}</p>
    </div>
  )
}
