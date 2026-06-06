'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import {
  Bell, AlertTriangle, Copy, Clock, Globe, Image as ImageIcon, Star,
  ChevronRight, Check, EyeOff,
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

// DataQualityCenter is self-sufficient: it subscribes to the media store
// directly so the bell badge and dialog content always reflect the current
// data state without waiting for a parent re-render.
export function DataQualityCenter() {
  const [open, setOpen] = useState(false)
  const router = useRouter()

  const { entries, editEntry } = useMedia()
  const { result, ignoreDuplicate } = useDataQuality(entries)
  const [fixingId, setFixingId] = useState<string | null>(null)

  const count = result.totalCount

  function goToEntry(entry: MediaEntry) {
    setOpen(false)
    router.push(`/my-list?entry=${entry.id}`)
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
        aria-label="Data Quality Center"
      >
        <Bell className="w-5 h-5 text-white/70" />
        {count > 0 && (
          <span className="absolute -top-1.5 -right-1.5 min-w-[18px] h-[18px] px-1 rounded-full bg-red-500 text-white text-[10px] font-bold flex items-center justify-center">
            {count > 99 ? '99+' : count}
          </span>
        )}
      </button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Bell className="w-4 h-4 text-blue-400" />
              Data Quality Center
              {count > 0 && (
                <Badge variant="secondary" className="ml-1">{count} issue{count !== 1 ? 's' : ''}</Badge>
              )}
            </DialogTitle>
          </DialogHeader>

          {count === 0 ? (
            <div className="py-10 text-center">
              <div className="w-14 h-14 rounded-2xl bg-emerald-500/15 flex items-center justify-center mx-auto mb-3">
                <Check className="w-7 h-7 text-emerald-400" />
              </div>
              <p className="text-white font-medium">All clear</p>
              <p className="text-sm text-white/40 mt-1">No data quality issues found.</p>
            </div>
          ) : (
            <div className="space-y-3 mt-1">
              {/* Classification Issues */}
              <Section
                icon={<AlertTriangle className="w-4 h-4 text-amber-400" />}
                title="Classification Issues"
                count={result.classification.length}
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

              {/* Missing Runtime */}
              <Section
                icon={<Clock className="w-4 h-4 text-blue-400" />}
                title="Missing Runtime"
                count={result.missingRuntime.length}
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
              >
                {result.missingCountry.map((e) => (
                  <Row key={e.id} entry={e} onView={() => goToEntry(e)} />
                ))}
              </Section>

              {/* Missing Poster */}
              <Section
                icon={<ImageIcon className="w-4 h-4 text-pink-400" />}
                title="Missing Poster"
                count={result.missingPoster.length}
              >
                {result.missingPoster.map((e) => (
                  <Row key={e.id} entry={e} onView={() => goToEntry(e)} />
                ))}
              </Section>

              {/* Missing Personal Rating — completed titles only */}
              <Section
                icon={<Star className="w-4 h-4 text-yellow-400" />}
                title="Missing Personal Rating"
                count={result.missingRating.length}
              >
                {result.missingRating.map((e) => (
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
  icon, title, count, children,
}: {
  icon: React.ReactNode
  title: string
  count: number
  children: React.ReactNode
}) {
  if (count === 0) return null
  return (
    <div className="rounded-xl border border-white/10 overflow-hidden">
      <div className="flex items-center gap-2 px-3 py-2 bg-white/5">
        {icon}
        <span className="text-sm font-medium text-white flex-1">{title}</span>
        <Badge variant="secondary" className="text-[10px]">{count}</Badge>
      </div>
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
    <div className="flex items-center gap-2 px-3 py-2">
      <div className="flex-1 min-w-0">
        <p className="text-xs font-medium text-white truncate">{getDisplayTitle(entry)}</p>
        <div className="flex items-center gap-2 mt-0.5">{children}</div>
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
