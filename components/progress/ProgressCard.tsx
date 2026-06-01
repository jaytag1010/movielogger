'use client'

import Image from 'next/image'
import { Minus, Plus, CheckCircle, Film, MoreVertical, Pencil, Search, RefreshCw } from 'lucide-react'
import { MediaEntry, MEDIA_STATUS_COLORS } from '@/types/media'
import { getDisplayTitle } from '@/utils/formatters'
import { cn } from '@/utils/cn'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'

interface ProgressCardProps {
  entry: MediaEntry
  onDecrement: (entry: MediaEntry) => void
  onIncrement: (entry: MediaEntry) => void
  onFinish: (entry: MediaEntry) => void
  onEdit: (entry: MediaEntry) => void
  onSearchTMDB: (entry: MediaEntry) => void
  onRefreshMetadata: (entry: MediaEntry) => void
  /** Shows a spinner on the Refresh Metadata item while refreshing this entry. */
  refreshing?: boolean
}

export function ProgressCard({
  entry,
  onDecrement,
  onIncrement,
  onFinish,
  onEdit,
  onSearchTMDB,
  onRefreshMetadata,
  refreshing = false,
}: ProgressCardProps) {
  const displayTitle = getDisplayTitle(entry)

  // Universal progress tracker — works for movies, series, and unknown types.
  // Movies have an effective total of 1 (0 = unwatched, 1 = watched).
  // Series / unknown use totalEpisodes (null = unknown → displayed as ?).
  const currentProgress = entry.nextEpisodeToWatch ?? 0
  const effectiveTotal = entry.type === 'movie'
    ? (entry.totalEpisodes ?? 1)
    : entry.totalEpisodes   // null means unknown for series/other

  const epDisplay = String(currentProgress)
  const totalDisplay = effectiveTotal != null ? `/ ${effectiveTotal}` : '/ ?'

  const canDecrement = currentProgress > 0
  const canIncrement = effectiveTotal == null || currentProgress < effectiveTotal

  const statusColor = MEDIA_STATUS_COLORS[entry.status]

  return (
    <div className="flex items-center gap-3 px-3 py-2.5 bg-white/[0.03] border border-white/8 rounded-xl hover:bg-white/[0.05] transition-colors">

      {/* Poster */}
      <div className="relative w-10 h-14 flex-shrink-0 rounded-lg overflow-hidden bg-white/5">
        {entry.posterUrl ? (
          <Image
            src={entry.posterUrl}
            alt={entry.title}
            fill
            className="object-cover"
            sizes="40px"
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center">
            <Film className="w-4 h-4 text-white/20" />
          </div>
        )}
      </div>

      {/* Info + Controls */}
      <div className="flex-1 min-w-0 space-y-1.5">

        {/* Title row */}
        <p className="text-sm font-medium text-white leading-tight truncate">{displayTitle}</p>

        {/* Controls row */}
        <div className="flex items-center gap-2 flex-wrap">

          {/* Status badge */}
          <span className={cn(
            'inline-flex items-center text-[10px] font-semibold uppercase tracking-wide border rounded-full px-2 py-0.5',
            statusColor
          )}>
            {entry.status === 'on_hold' ? 'On Hold' : entry.status.charAt(0).toUpperCase() + entry.status.slice(1)}
          </span>

          {/* Progress tracker — all types */}
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={() => onDecrement(entry)}
              disabled={!canDecrement}
              className={cn(
                'w-6 h-6 rounded-lg border flex items-center justify-center transition-all',
                canDecrement
                  ? 'border-white/20 text-white/60 hover:border-white/40 hover:text-white hover:bg-white/10'
                  : 'border-white/5 text-white/15 cursor-not-allowed'
              )}
              aria-label="Decrement progress"
            >
              <Minus className="w-3 h-3" />
            </button>

            <span className="text-xs text-white/60 font-mono min-w-[2.5rem] text-center">
              {epDisplay}
              <span className="text-white/30">{totalDisplay}</span>
            </span>

            <button
              type="button"
              onClick={() => onIncrement(entry)}
              disabled={!canIncrement}
              className={cn(
                'w-6 h-6 rounded-lg border flex items-center justify-center transition-all',
                canIncrement
                  ? 'border-white/20 text-white/60 hover:border-white/40 hover:text-white hover:bg-white/10'
                  : 'border-white/5 text-white/15 cursor-not-allowed'
              )}
              aria-label="Increment progress"
            >
              <Plus className="w-3 h-3" />
            </button>
          </div>

          {/* Finished button */}
          <button
            type="button"
            onClick={() => onFinish(entry)}
            className="inline-flex items-center gap-1 text-[10px] font-semibold text-emerald-400 border border-emerald-500/30 bg-emerald-500/10 hover:bg-emerald-500/20 rounded-full px-2.5 py-0.5 transition-all ml-auto"
          >
            <CheckCircle className="w-3 h-3" />
            Finished
          </button>
        </div>
      </div>

      {/* ⋮ Menu */}
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button
            type="button"
            className="flex-shrink-0 w-7 h-7 flex items-center justify-center rounded-lg text-white/30 hover:text-white/60 hover:bg-white/10 transition-all"
            aria-label="Card options"
          >
            <MoreVertical className="w-4 h-4" />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-44">
          <DropdownMenuItem onClick={() => onEdit(entry)}>
            <Pencil className="w-3.5 h-3.5 mr-2 text-white/50" />
            Edit
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => onSearchTMDB(entry)}>
            <Search className="w-3.5 h-3.5 mr-2 text-blue-400/70" />
            Search TMDB
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem
            onClick={() => onRefreshMetadata(entry)}
            disabled={!entry.tmdbId || refreshing}
          >
            <RefreshCw className={cn('w-3.5 h-3.5 mr-2 text-white/50', refreshing && 'animate-spin')} />
            {refreshing ? 'Refreshing…' : 'Refresh Metadata'}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  )
}
