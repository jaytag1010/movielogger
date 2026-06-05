'use client'

import { useState } from 'react'
import Image from 'next/image'
import { motion } from 'framer-motion'
import { Star, Clock, Calendar, MoreVertical, Edit, Trash2, Film, Tv } from 'lucide-react'
import { MediaEntry } from '@/types/media'
import { StatusBadge } from './StatusBadge'
import { Badge } from '@/components/ui/badge'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Button } from '@/components/ui/button'
import { formatDate, formatWatchHours, formatGenres, truncateText, getDisplayTitle, getEffectiveMediaType } from '@/utils/formatters'
import { calculateEntryWatchHours } from '@/utils/watchTime'

interface MediaCardProps {
  entry: MediaEntry
  onEdit?: (entry: MediaEntry) => void
  onDelete?: (id: string) => void
  index?: number
}

export function MediaCard({ entry, onEdit, onDelete, index = 0 }: MediaCardProps) {
  const [imgError, setImgError] = useState(false)
  const watchHours = calculateEntryWatchHours(entry)
  const effectiveType = getEffectiveMediaType(entry)
  const Icon = effectiveType === 'movie' ? Film : Tv

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.05, duration: 0.3 }}
      className="group"
    >
      <div className="relative bg-white/5 backdrop-blur-sm border border-white/10 rounded-2xl overflow-hidden hover:border-white/20 hover:bg-white/8 transition-all duration-300 hover:shadow-glass">
        <div className="flex gap-3 p-3">
          {/* Poster */}
          <div className="relative w-16 h-24 flex-shrink-0 rounded-xl overflow-hidden bg-white/5 border border-white/10">
            {entry.posterUrl && !imgError ? (
              <Image
                src={entry.posterUrl}
                alt={entry.title}
                fill
                className="object-cover"
                onError={() => setImgError(true)}
                sizes="64px"
              />
            ) : (
              <div className="w-full h-full flex flex-col items-center justify-center gap-1">
                <Icon className="w-5 h-5 text-white/20" />
              </div>
            )}

            {/* Type badge overlay */}
            <div className="absolute top-1 left-1">
              <div className="w-4 h-4 rounded bg-black/60 backdrop-blur-sm flex items-center justify-center">
                <Icon className="w-2.5 h-2.5 text-white/70" />
              </div>
            </div>
          </div>

          {/* Content */}
          <div className="flex-1 min-w-0">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0 flex-1">
                <h3 className="text-sm font-semibold text-white leading-tight truncate">
                  {getDisplayTitle(entry)}
                </h3>
                <div className="flex items-center gap-2 mt-0.5">
                  {entry.yearMade && (
                    <span className="text-xs text-white/40">{entry.yearMade}</span>
                  )}
                  {entry.country && (
                    <span className="text-xs text-white/30 truncate">{entry.country}</span>
                  )}
                </div>
              </div>

              {/* Actions */}
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    className="opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0"
                  >
                    <MoreVertical className="w-4 h-4" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  {onEdit && (
                    <DropdownMenuItem onClick={() => onEdit(entry)}>
                      <Edit className="w-3.5 h-3.5 mr-2" />
                      Edit
                    </DropdownMenuItem>
                  )}
                  <DropdownMenuSeparator />
                  {onDelete && (
                    <DropdownMenuItem
                      className="text-red-400 focus:text-red-400"
                      onClick={() => onDelete(entry.id!)}
                    >
                      <Trash2 className="w-3.5 h-3.5 mr-2" />
                      Delete
                    </DropdownMenuItem>
                  )}
                </DropdownMenuContent>
              </DropdownMenu>
            </div>

            {/* Status */}
            <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
              <StatusBadge status={entry.status} />
              {entry.personalRating !== null && (
                <span className="inline-flex items-center gap-0.5 text-xs font-semibold text-amber-400">
                  <Star className="w-2.5 h-2.5 fill-amber-400" />
                  {entry.personalRating.toFixed(2)}
                </span>
              )}
              {entry.ageRating && (
                <Badge variant="outline" className="text-[10px] px-1.5 py-0">
                  {entry.ageRating}
                </Badge>
              )}
            </div>

            {/* Genres */}
            {entry.genres && entry.genres.length > 0 && (
              <p className="text-xs text-white/30 mt-1 truncate">
                {formatGenres(entry.genres)}
              </p>
            )}

            {/* Stats row */}
            <div className="flex items-center gap-3 mt-1.5 text-xs text-white/40">
              {watchHours > 0 && (
                <span className="flex items-center gap-0.5">
                  <Clock className="w-3 h-3" />
                  {formatWatchHours(watchHours)}
                </span>
              )}
              {entry.dateFinished && (
                <span className="flex items-center gap-0.5">
                  <Calendar className="w-3 h-3" />
                  {formatDate(entry.dateFinished)}
                </span>
              )}
              {entry.totalEpisodes && (
                <span>{entry.totalEpisodes} eps</span>
              )}
            </div>
          </div>
        </div>

        {/* Internal ID */}
        <div className="px-3 pb-2 flex items-center justify-between">
          <span className="text-[9px] font-mono text-white/15">{entry.internalId}</span>
        </div>
      </div>
    </motion.div>
  )
}
