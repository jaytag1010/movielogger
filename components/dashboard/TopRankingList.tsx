'use client'

import { motion } from 'framer-motion'
import Image from 'next/image'
import Link from 'next/link'
import { Star, Film, Tv, ChevronRight } from 'lucide-react'
import { MediaEntry, MediaType } from '@/types/media'
import { GlassCard } from '@/components/common/GlassCard'
import { Badge } from '@/components/ui/badge'
import { getDisplayTitle, getEffectiveMediaType, getDisplayPosterUrl } from '@/utils/formatters'

interface TopRankingListProps {
  entries: MediaEntry[]
  type: MediaType
  limit?: number
}

export function TopRankingList({ entries, type, limit = 10 }: TopRankingListProps) {
  const filtered = entries
    .filter((e) => getEffectiveMediaType(e) === type && e.personalRating !== null)
    .sort((a, b) => (b.personalRating ?? 0) - (a.personalRating ?? 0))
    .slice(0, limit)

  const title = type === 'movie' ? 'Top Movies' : 'Top Series'
  const Icon = type === 'movie' ? Film : Tv
  const maxRating = 10
  const seeAllHref = `/my-list?tab=${type}&sort=rating_desc`

  if (filtered.length === 0) {
    return (
      <GlassCard padding="md">
        <div className="flex items-center gap-2 mb-4">
          <Icon className="w-5 h-5 text-blue-400" />
          <h3 className="text-base font-semibold text-white">{title}</h3>
        </div>
        <p className="text-sm text-white/40 text-center py-6">
          No rated {type === 'movie' ? 'movies' : 'series'} yet
        </p>
      </GlassCard>
    )
  }

  return (
    <GlassCard padding="md">
      <div className="flex items-center gap-2 mb-4">
        <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-blue-600 to-purple-600 flex items-center justify-center shadow-glow">
          <Icon className="w-4 h-4 text-white" />
        </div>
        <h3 className="text-base font-semibold text-white">{title}</h3>
        <Link
          href={seeAllHref}
          className="ml-auto inline-flex items-center gap-0.5 text-xs font-medium text-blue-400 hover:text-blue-300 transition-colors"
        >
          See All
          <ChevronRight className="w-3.5 h-3.5" />
        </Link>
      </div>

      <div className="space-y-2">
        {filtered.map((entry, index) => (
          <motion.div
            key={entry.id}
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: index * 0.05 }}
            className="group"
          >
            <div className="flex items-center gap-3 py-1">
              {/* Rank */}
              <div className="w-6 flex-shrink-0 text-center">
                {index < 3 ? (
                  <span className="text-sm font-bold">
                    {index === 0 ? '🥇' : index === 1 ? '🥈' : '🥉'}
                  </span>
                ) : (
                  <span className="text-xs font-semibold text-white/30">{index + 1}</span>
                )}
              </div>

              {/* Poster */}
              <div className="w-8 h-10 flex-shrink-0 rounded overflow-hidden bg-white/5 border border-white/10">
                {getDisplayPosterUrl(entry) ? (
                  <Image
                    src={getDisplayPosterUrl(entry)!}
                    alt={entry.title}
                    width={32}
                    height={40}
                    className="w-full h-full object-cover"
                  />
                ) : (
                  <div className="w-full h-full flex items-center justify-center">
                    <Icon className="w-3 h-3 text-white/20" />
                  </div>
                )}
              </div>

              {/* Title + bar */}
              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between mb-1 gap-2">
                  <p className="text-xs font-medium text-white truncate">{getDisplayTitle(entry)}</p>
                  <span className="text-xs font-bold text-amber-400 flex-shrink-0 flex items-center gap-0.5">
                    <Star className="w-2.5 h-2.5 fill-amber-400" />
                    {entry.personalRating?.toFixed(2)}
                  </span>
                </div>
                <div className="h-1.5 bg-white/5 rounded-full overflow-hidden">
                  <motion.div
                    className="h-full bg-gradient-to-r from-blue-500 to-purple-500 rounded-full"
                    initial={{ width: 0 }}
                    animate={{ width: `${((entry.personalRating ?? 0) / maxRating) * 100}%` }}
                    transition={{ delay: index * 0.05 + 0.2, duration: 0.6, ease: 'easeOut' }}
                  />
                </div>
              </div>
            </div>
          </motion.div>
        ))}
      </div>
    </GlassCard>
  )
}
