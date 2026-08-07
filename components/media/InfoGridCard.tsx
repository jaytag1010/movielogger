'use client'

import { useState } from 'react'
import { Calendar, Clock, Eye, Film, MoreVertical, Star, Tv } from 'lucide-react'
import { motion } from 'framer-motion'
import { MediaEntry } from '@/types/media'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { TMDBPosterImage } from '@/components/common/TMDBPosterImage'
import { StatusBadge } from './StatusBadge'
import {
  formatDate,
  formatGenres,
  formatWatchHours,
  getDisplayPosterUrl,
  getDisplayTitle,
  getEffectiveMediaType,
  getEpisodesWatched,
} from '@/utils/formatters'
import { calculateEntryWatchHours } from '@/utils/watchTime'

interface InfoGridCardProps {
  entry: MediaEntry
  index?: number
  onView: (entry: MediaEntry) => void
  onEdit?: (entry: MediaEntry) => void
  onDelete?: (id: string) => void
}

export function InfoGridCard({ entry, index = 0, onView, onEdit, onDelete }: InfoGridCardProps) {
  const [imgError, setImgError] = useState(false)
  const poster = getDisplayPosterUrl(entry)
  const type = getEffectiveMediaType(entry)
  const Icon = type === 'series' ? Tv : Film
  const watched = getEpisodesWatched(entry)
  const total = entry.totalEpisodes ?? (type === 'movie' ? 1 : null)
  const remaining = total != null ? Math.max(0, total - watched) : null
  const watchHours = calculateEntryWatchHours(entry)

  const contextualLine = (() => {
    if (entry.status === 'completed' && entry.dateFinished) {
      return `Finished ${formatDate(entry.dateFinished)}`
    }
    if (entry.status === 'planned' && entry.tmdbReleaseDate) {
      return `Release ${formatPlainDate(entry.tmdbReleaseDate)}`
    }
    if (entry.status === 'watching') {
      return remaining != null
        ? `${remaining} remaining`
        : `${watched} watched`
    }
    return null
  })()

  return (
    <motion.div
      role="button"
      tabIndex={0}
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.025, duration: 0.25 }}
      onClick={() => onView(entry)}
      onKeyDown={(event) => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault()
          onView(entry)
        }
      }}
      className="group relative min-h-[218px] rounded-xl border border-white/10 bg-white/5 p-2.5 text-left transition-all hover:border-white/20 hover:bg-white/[0.08] focus:outline-none focus:ring-2 focus:ring-blue-500/50"
    >
      <div className="flex gap-2.5">
        <div className="relative h-28 w-20 flex-shrink-0 overflow-hidden rounded-lg border border-white/10 bg-white/5">
          {poster && !imgError ? (
            <TMDBPosterImage
              src={poster}
              alt={entry.title}
              fill
              sizes="80px"
              className="object-cover"
              onError={() => setImgError(true)}
            />
          ) : (
            <div className="flex h-full w-full items-center justify-center">
              <Icon className="h-6 w-6 text-white/25" />
            </div>
          )}
        </div>

        <div className="min-w-0 flex-1">
          <div className="flex items-start gap-1">
            <div className="min-w-0 flex-1">
              <h3 className="line-clamp-2 text-sm font-semibold leading-tight text-white">
                {getDisplayTitle(entry)}
              </h3>
              <p className="mt-0.5 truncate text-[11px] text-white/40">
                {[entry.yearMade, entry.country].filter(Boolean).join(' / ') || (type === 'series' ? 'Series' : 'Movie')}
              </p>
            </div>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-sm"
                  className="-mr-1 -mt-1 h-7 w-7 flex-shrink-0 opacity-80"
                  onClick={(event) => event.stopPropagation()}
                >
                  <MoreVertical className="h-4 w-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" onClick={(event) => event.stopPropagation()}>
                <DropdownMenuItem onClick={() => onView(entry)}>
                  <Eye className="mr-2 h-3.5 w-3.5" />
                  Details
                </DropdownMenuItem>
                {onEdit && <DropdownMenuItem onClick={() => onEdit(entry)}>Edit</DropdownMenuItem>}
                {onDelete && (
                  <>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem
                      className="text-red-400 focus:text-red-400"
                      onClick={() => onDelete(entry.id!)}
                    >
                      Delete
                    </DropdownMenuItem>
                  </>
                )}
              </DropdownMenuContent>
            </DropdownMenu>
          </div>

          <div className="mt-2 flex flex-wrap items-center gap-1.5">
            <StatusBadge status={entry.status} />
            {entry.personalRating != null && (
              <span className="inline-flex items-center gap-0.5 text-xs font-semibold text-amber-400">
                <Star className="h-3 w-3 fill-amber-400" />
                {entry.personalRating.toFixed(2)}
              </span>
            )}
          </div>
        </div>
      </div>

      <div className="mt-2 space-y-1.5 text-[11px] text-white/45">
        {entry.genres.length > 0 && (
          <p className="truncate">{formatGenres(entry.genres.slice(0, 2))}</p>
        )}
        <div className="grid grid-cols-2 gap-1.5">
          <span>{total ?? '—'} eps</span>
          <span className="inline-flex items-center gap-1">
            <Clock className="h-3 w-3" />
            {formatWatchHours(watchHours)}
          </span>
        </div>
        {contextualLine && (
          <p className="inline-flex items-center gap-1 text-white/55">
            <Calendar className="h-3 w-3" />
            {contextualLine}
          </p>
        )}
      </div>

      <div className="absolute bottom-2 left-2.5 right-2.5 flex items-center justify-between">
        <span className="font-mono text-[9px] text-white/20">{entry.internalId}</span>
        <Badge variant="outline" className="px-1.5 py-0 text-[9px] text-white/35">
          {type === 'series' ? 'Series' : 'Movie'}
        </Badge>
      </div>
    </motion.div>
  )
}

function formatPlainDate(date: string): string {
  return new Date(`${date}T00:00:00`).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  })
}
