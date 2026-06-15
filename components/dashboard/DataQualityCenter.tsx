'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import {
  Bell, AlertTriangle, Copy, Clock, Globe, Image as ImageIcon, Star,
  ChevronRight, Check, EyeOff, Tv, Loader2,
  PackageOpen, Link as LinkIcon,
} from 'lucide-react'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from '@/components/ui/dialog'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { MediaEntry } from '@/types/media'
import { DuplicateGroup } from '@/lib/dataQuality'
import { getDisplayTitle, getEffectiveMediaType } from '@/utils/formatters'
import { useMedia } from '@/hooks/useMedia'
import { useDataQuality } from '@/hooks/useDataQuality'
import { useEpisodeAvailability, NewEpisodeInfo } from '@/hooks/useEpisodeAvailability'

export function DataQualityCenter() {
  const [open, setOpen] = useState(false)
  const router = useRouter()

  const { entries, editEntry } = useMedia()
  const { result, ignoreDuplicate } = useDataQuality(entries)
  const episodeAvail = useEpisodeAvailability(entries)
  const [fixingId, setFixingId] = useState<string | null>(null)

  // Trigger async TMDB episode checks when the dialog opens
  useEffect(() => {
    if (open) {
      episodeAvail.fetchAvailability()
    }
  // fetchAvailability is stable (useCallback), safe to omit from deps
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

  const dqCount =
    result.classification.length +
    result.duplicates.length +
    result.missingRating.length +
    result.missingRuntime.length +
    result.missingCountry.length +
    result.missingTmdbLink.length +
    result.missingEpisodeProgress.length +
    result.missingPoster.length
  const episodeCount = episodeAvail.newEpisodes.length + episodeAvail.readyToBinge.length
  const totalBellCount = dqCount + episodeCount

  function goToEntry(entry: MediaEntry) {
    setOpen(false)
    router.push(`/my-list?entry=${entry.id}`)
  }

  function openFilteredList(items: MediaEntry[], label: string) {
    const ids = Array.from(new Set(items.map((e) => e.id).filter(Boolean))) as string[]
    if (ids.length === 0) return
    setOpen(false)
    const params = new URLSearchParams()
    params.set('ids', ids.join(','))
    params.set('label', label)
    router.push(`/my-list?${params.toString()}`)
  }

  function openProgressList(items: MediaEntry[], label: string, filter: 'watching' | 'planned') {
    const ids = Array.from(new Set(items.map((e) => e.id).filter(Boolean))) as string[]
    if (ids.length === 0) return
    setOpen(false)
    const params = new URLSearchParams()
    params.set('filter', filter)
    params.set('ids', ids.join(','))
    params.set('label', label)
    router.push(`/progress?${params.toString()}`)
  }

  async function fixClassification(entry: MediaEntry) {
    if (!entry.id) return
    const implied = entry.totalEpisodes != null && entry.totalEpisodes > 1 ? 'series' : 'movie'
    setFixingId(entry.id)
    try {
      await editEntry(entry.id, { type: implied })
      toast.success(`Reclassified "${entry.title}" as ${implied}`)
    } catch {
      toast.error('Failed to update entry')
    } finally {
      setFixingId(null)
    }
  }

  return (
    <>
      {/* Bell trigger */}
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="relative flex-shrink-0 w-10 h-10 rounded-xl border border-white/10 bg-white/5 hover:bg-white/10 flex items-center justify-center transition-colors"
        aria-label="Notification Center"
      >
        <Bell className="w-5 h-5 text-white/70" />
        {totalBellCount > 0 && (
          <span className="absolute -top-1.5 -right-1.5 min-w-[18px] h-[18px] px-1 rounded-full bg-red-500 text-white text-[10px] font-bold flex items-center justify-center">
            {totalBellCount > 99 ? '99+' : totalBellCount}
          </span>
        )}
      </button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="w-[calc(100vw-1.5rem)] sm:max-w-2xl max-h-[85vh] overflow-y-auto overflow-x-hidden">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Bell className="w-4 h-4 text-blue-400" />
              Notification Center
              {totalBellCount > 0 && (
                <Badge variant="secondary" className="ml-1">
                  {totalBellCount} issue{totalBellCount !== 1 ? 's' : ''}
                </Badge>
              )}
            </DialogTitle>
          </DialogHeader>

          {totalBellCount === 0 && !episodeAvail.loading ? (
            <div className="py-10 text-center">
              <div className="w-14 h-14 rounded-2xl bg-emerald-500/15 flex items-center justify-center mx-auto mb-3">
                <Check className="w-7 h-7 text-emerald-400" />
              </div>
              <p className="text-white font-medium">All clear</p>
              <p className="text-sm text-white/40 mt-1">No issues found.</p>
            </div>
          ) : (
            <div className="space-y-3 mt-1">

              {/* ── Episode Availability (async) ─────────────────────────── */}
              {episodeAvail.loading && (
                <div className="flex items-center gap-2 px-3 py-2 text-xs text-white/40">
                  <Loader2 className="w-3 h-3 animate-spin" />
                  Checking episode availability…
                </div>
              )}

              {/* Episodes Waiting For You */}
              <Section
                icon={<Bell className="w-4 h-4 text-sky-400" />}
                title="Episodes Waiting For You"
                count={episodeAvail.newEpisodes.length}
                onOpenList={() => openProgressList(
                  episodeAvail.newEpisodes.map((n) => n.entry),
                  'Episodes Waiting For You',
                  'watching'
                )}
              >
                {episodeAvail.newEpisodes.map(({ entry, delta }: NewEpisodeInfo) => (
                  <Row
                    key={entry.id}
                    entry={entry}
                    onView={() => openProgressList([entry], 'Episodes Waiting For You', 'watching')}
                  >
                    <span className="text-[10px] text-sky-400 font-semibold">{delta} waiting</span>
                  </Row>
                ))}
              </Section>

              {/* Ready to Binge */}
              <Section
                icon={<PackageOpen className="w-4 h-4 text-violet-400" />}
                title="Ready to Binge"
                count={episodeAvail.readyToBinge.length}
                onOpenList={() => openProgressList(episodeAvail.readyToBinge, 'Ready to Binge', 'planned')}
              >
                {episodeAvail.readyToBinge.map((e) => (
                  <Row
                    key={e.id}
                    entry={e}
                    onView={() => openProgressList([e], 'Ready to Binge', 'planned')}
                  >
                    <span className="text-[10px] text-white/40">All episodes available</span>
                  </Row>
                ))}
              </Section>

              {/* ── Data Quality (synchronous) ───────────────────────────── */}

              {/* Classification Issues */}
              <Section
                icon={<AlertTriangle className="w-4 h-4 text-amber-400" />}
                title="Classification Issues"
                count={result.classification.length}
                onOpenList={() => openFilteredList(result.classification, 'Classification Issues')}
              >
                {result.classification.map((e) => {
                  const implied = e.totalEpisodes != null && e.totalEpisodes > 1 ? 'series' : 'movie'
                  return (
                    <Row key={e.id} entry={e} onView={() => goToEntry(e)}>
                      <span className="text-[10px] text-white/40">
                        {e.type} · {e.totalEpisodes ?? 0} eps
                      </span>
                      <Button
                        size="sm"
                        variant="outline"
                        className="h-6 text-[10px] px-2"
                        disabled={fixingId === e.id}
                        onClick={() => fixClassification(e)}
                      >
                        Fix → {implied}
                      </Button>
                    </Row>
                  )
                })}
              </Section>

              {/* Potential Duplicates */}
              <Section
                icon={<Copy className="w-4 h-4 text-purple-400" />}
                title="Potential Duplicates"
                count={result.duplicates.length}
                onOpenList={() => openFilteredList(
                  result.duplicates.flatMap((group) => group.entries),
                  'Potential Duplicates'
                )}
              >
                {result.duplicates.map((group) => (
                  <DuplicateRow
                    key={group.key}
                    group={group}
                    onView={goToEntry}
                    onIgnore={() => ignoreDuplicate(group.key)}
                  />
                ))}
              </Section>

              {/* Missing Rating */}
              <Section
                icon={<Star className="w-4 h-4 text-yellow-400" />}
                title="Missing Rating"
                count={result.missingRating.length}
                onOpenList={() => openFilteredList(result.missingRating, 'Missing Rating')}
              >
                {result.missingRating.map((e) => (
                  <Row key={e.id} entry={e} onView={() => goToEntry(e)}>
                    <span className="text-[10px] text-white/40">Completed · no rating</span>
                  </Row>
                ))}
              </Section>

              {/* Missing Episode Progress */}
              <Section
                icon={<Tv className="w-4 h-4 text-teal-400" />}
                title="Missing Episode Progress"
                count={result.missingEpisodeProgress.length}
                onOpenList={() => openFilteredList(result.missingEpisodeProgress, 'Missing Episode Progress')}
              >
                {result.missingEpisodeProgress.map((e) => (
                  <Row key={e.id} entry={e} onView={() => goToEntry(e)}>
                    <span className="text-[10px] text-white/40">Watching · no episode recorded</span>
                  </Row>
                ))}
              </Section>

              {/* Missing Runtime */}
              <Section
                icon={<Clock className="w-4 h-4 text-blue-400" />}
                title="Missing Runtime"
                count={result.missingRuntime.length}
                onOpenList={() => openFilteredList(result.missingRuntime, 'Missing Runtime')}
              >
                {result.missingRuntime.map((e) => (
                  <Row key={e.id} entry={e} onView={() => goToEntry(e)} />
                ))}
              </Section>

              {/* Missing Country */}
              <Section
                icon={<Globe className="w-4 h-4 text-cyan-400" />}
                title="Missing Country"
                count={result.missingCountry.length}
                onOpenList={() => openFilteredList(result.missingCountry, 'Missing Country')}
              >
                {result.missingCountry.map((e) => (
                  <Row key={e.id} entry={e} onView={() => goToEntry(e)} />
                ))}
              </Section>

              {/* Missing TMDB Link */}
              <Section
                icon={<LinkIcon className="w-4 h-4 text-indigo-400" />}
                title="Missing TMDB Link"
                count={result.missingTmdbLink.length}
                onOpenList={() => openFilteredList(result.missingTmdbLink, 'Missing TMDB Link')}
              >
                {result.missingTmdbLink.map((e) => (
                  <Row key={e.id} entry={e} onView={() => goToEntry(e)} />
                ))}
              </Section>

              {/* Missing Poster */}
              <Section
                icon={<ImageIcon className="w-4 h-4 text-pink-400" />}
                title="Missing Poster"
                count={result.missingPoster.length}
                onOpenList={() => openFilteredList(result.missingPoster, 'Missing Poster')}
              >
                {result.missingPoster.map((e) => (
                  <Row key={e.id} entry={e} onView={() => goToEntry(e)} />
                ))}
              </Section>

            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  )
}

// ── Sub-components ───────────────────────────────────────────────────────────

function Section({
  icon, title, count, children, onOpenList,
}: {
  icon: React.ReactNode
  title: string
  count: number
  children: React.ReactNode
  onOpenList?: () => void
}) {
  if (count === 0) return null
  return (
    <div className="rounded-xl border border-white/10 overflow-hidden">
      <button
        type="button"
        onClick={onOpenList}
        className="w-full flex items-center gap-2 px-3 py-2 bg-white/5 hover:bg-white/10 text-left transition-colors"
      >
        {icon}
        <span className="text-sm font-medium text-white flex-1">{title}</span>
        <Badge variant="secondary" className="text-[10px]">{count}</Badge>
        <ChevronRight className="w-3.5 h-3.5 text-white/35" />
      </button>
      <div className="divide-y divide-white/5 max-h-56 overflow-y-auto">
        {children}
      </div>
    </div>
  )
}

function Row({
  entry, onView, children,
}: {
  entry: MediaEntry
  onView: () => void
  children?: React.ReactNode
}) {
  return (
    <div className="flex items-center gap-2 px-3 py-2 min-w-0">
      <div className="flex-1 min-w-0">
        <p className="text-xs font-medium text-white truncate">{getDisplayTitle(entry)}</p>
        {children && <div className="flex items-center gap-2 mt-0.5 min-w-0 flex-wrap">{children}</div>}
      </div>
      <button
        type="button"
        onClick={onView}
        className="flex-shrink-0 inline-flex items-center gap-0.5 text-[10px] text-blue-400 hover:text-blue-300"
      >
        View<ChevronRight className="w-3 h-3" />
      </button>
    </div>
  )
}

function DuplicateRow({
  group, onView, onIgnore,
}: {
  group: DuplicateGroup
  onView: (e: MediaEntry) => void
  onIgnore: () => void
}) {
  return (
    <div className="px-3 py-2">
      <div className="flex items-center justify-between gap-2 mb-1">
        <span className="text-[10px] text-white/40">
          {group.reason === 'tmdb' ? 'Same TMDB ID' : 'Similar title'} · {group.entries.length} entries
        </span>
        <button
          type="button"
          onClick={onIgnore}
          className="inline-flex items-center gap-0.5 text-[10px] text-white/40 hover:text-white/70"
        >
          <EyeOff className="w-3 h-3" />Ignore
        </button>
      </div>
      <div className="space-y-1">
        {group.entries.map((e) => (
          <button
            key={e.id}
            type="button"
            onClick={() => onView(e)}
            className="w-full flex items-center justify-between gap-2 text-left hover:bg-white/5 rounded px-1.5 py-1 -mx-1.5"
          >
            <span className="text-xs text-white/80 truncate">{getDisplayTitle(e)}</span>
            <span className="text-[10px] text-white/30 flex-shrink-0">
              {getEffectiveMediaType(e) === 'series' ? 'Series' : 'Movie'}
            </span>
          </button>
        ))}
      </div>
    </div>
  )
}
