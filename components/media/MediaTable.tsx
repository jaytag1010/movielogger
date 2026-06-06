'use client'

import Image from 'next/image'
import { Pencil, Trash2, Film, Tv } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { MediaEntry, MEDIA_STATUS_LABELS, MEDIA_STATUS_COLORS } from '@/types/media'
import { getDisplayTitle, getEffectiveMediaType, getDisplayPosterUrl } from '@/utils/formatters'
import { cn } from '@/utils/cn'

interface MediaTableProps {
  entries: MediaEntry[]
  onEdit: (entry: MediaEntry) => void
  onDelete: (id: string) => void
}

function calcWatchHours(entry: MediaEntry): string {
  if (entry.watchHours != null) return entry.watchHours.toFixed(1)
  if (entry.totalEpisodes != null && entry.episodeDurationMinutes != null) {
    return (entry.totalEpisodes * entry.episodeDurationMinutes / 60).toFixed(1)
  }
  return '—'
}

export function MediaTable({ entries, onEdit, onDelete }: MediaTableProps) {
  if (entries.length === 0) return null

  return (
    <div className="overflow-x-auto rounded-xl border border-white/10">
      <table className="w-full text-sm min-w-[800px]">
        <thead>
          <tr className="border-b border-white/10 bg-white/5">
            <th className="w-10 px-3 py-2.5" />
            <th className="px-3 py-2.5 text-left text-xs font-semibold text-white/50 uppercase tracking-wider">Title</th>
            <th className="px-3 py-2.5 text-left text-xs font-semibold text-white/50 uppercase tracking-wider">Type</th>
            <th className="px-3 py-2.5 text-left text-xs font-semibold text-white/50 uppercase tracking-wider">Status</th>
            <th className="px-3 py-2.5 text-left text-xs font-semibold text-white/50 uppercase tracking-wider">Country</th>
            <th className="px-3 py-2.5 text-right text-xs font-semibold text-white/50 uppercase tracking-wider">Year</th>
            <th className="px-3 py-2.5 text-right text-xs font-semibold text-white/50 uppercase tracking-wider">Eps</th>
            <th className="px-3 py-2.5 text-right text-xs font-semibold text-white/50 uppercase tracking-wider">Rating</th>
            <th className="px-3 py-2.5 text-right text-xs font-semibold text-white/50 uppercase tracking-wider">Hrs</th>
            <th className="w-16 px-3 py-2.5" />
          </tr>
        </thead>
        <tbody className="divide-y divide-white/5">
          {entries.map((entry) => {
            const type = getEffectiveMediaType(entry)
            const statusColor = MEDIA_STATUS_COLORS[entry.status]

            return (
              <tr
                key={entry.id}
                className="hover:bg-white/[0.03] transition-colors group"
              >
                {/* Poster */}
                <td className="px-3 py-2">
                  <div className="w-7 h-10 rounded overflow-hidden bg-white/10 flex items-center justify-center flex-shrink-0">
                    {getDisplayPosterUrl(entry) ? (
                      <Image
                        src={getDisplayPosterUrl(entry)!}
                        alt={entry.title}
                        width={28}
                        height={40}
                        className="object-cover w-full h-full"
                        unoptimized
                      />
                    ) : type === 'series' ? (
                      <Tv className="w-3.5 h-3.5 text-white/30" />
                    ) : (
                      <Film className="w-3.5 h-3.5 text-white/30" />
                    )}
                  </div>
                </td>

                {/* Title */}
                <td className="px-3 py-2 max-w-[200px]">
                  <p className="font-medium text-white truncate">{getDisplayTitle(entry)}</p>
                </td>

                {/* Type */}
                <td className="px-3 py-2">
                  <Badge
                    variant="outline"
                    className={cn(
                      'text-[10px] px-1.5 py-0',
                      type === 'series'
                        ? 'text-blue-400 border-blue-500/30'
                        : 'text-purple-400 border-purple-500/30'
                    )}
                  >
                    {type === 'series' ? 'Series' : 'Movie'}
                  </Badge>
                </td>

                {/* Status */}
                <td className="px-3 py-2">
                  <Badge variant="outline" className={cn('text-[10px] px-1.5 py-0 border', statusColor)}>
                    {MEDIA_STATUS_LABELS[entry.status]}
                  </Badge>
                </td>

                {/* Country */}
                <td className="px-3 py-2 text-white/60 text-xs">{entry.country ?? '—'}</td>

                {/* Year */}
                <td className="px-3 py-2 text-right text-white/60 text-xs tabular-nums">
                  {entry.yearMade ?? '—'}
                </td>

                {/* Episodes */}
                <td className="px-3 py-2 text-right text-white/60 text-xs tabular-nums">
                  {type === 'series' ? (entry.totalEpisodes ?? '?') : '—'}
                </td>

                {/* Rating */}
                <td className="px-3 py-2 text-right text-xs tabular-nums">
                  {entry.personalRating != null
                    ? <span className="text-amber-400 font-semibold">{entry.personalRating.toFixed(2)}</span>
                    : <span className="text-white/30">—</span>}
                </td>

                {/* Watch Hours */}
                <td className="px-3 py-2 text-right text-white/60 text-xs tabular-nums">
                  {calcWatchHours(entry)}
                </td>

                {/* Actions */}
                <td className="px-3 py-2">
                  <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity justify-end">
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-6 w-6 p-0 text-white/40 hover:text-white"
                      onClick={() => onEdit(entry)}
                    >
                      <Pencil className="w-3 h-3" />
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-6 w-6 p-0 text-white/40 hover:text-red-400"
                      onClick={() => entry.id && onDelete(entry.id)}
                    >
                      <Trash2 className="w-3 h-3" />
                    </Button>
                  </div>
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}
