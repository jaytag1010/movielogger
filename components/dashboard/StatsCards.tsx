'use client'

import { motion } from 'framer-motion'
import { useRouter } from 'next/navigation'
import { Film, Tv, Clock, Star, TrendingUp } from 'lucide-react'
import { MediaEntry } from '@/types/media'
import { calculateTotalWatchHours } from '@/utils/watchTime'
import { formatWatchTime, getEffectiveMediaType } from '@/utils/formatters'
import { GlassCard } from '@/components/common/GlassCard'

interface StatsCardsProps {
  entries: MediaEntry[]
}

function scrollToId(id: string) {
  document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' })
}

export function StatsCards({ entries }: StatsCardsProps) {
  const router = useRouter()
  const completed = entries.filter((e) => e.status === 'completed')
  const movies = entries.filter((e) => getEffectiveMediaType(e) === 'movie')
  const series = entries.filter((e) => getEffectiveMediaType(e) === 'series')
  const totalHours = calculateTotalWatchHours(completed)

  const ratedEntries = entries.filter((e) => e.personalRating !== null)
  const avgRating =
    ratedEntries.length > 0
      ? ratedEntries.reduce((s, e) => s + (e.personalRating ?? 0), 0) / ratedEntries.length
      : 0

  const stats = [
    {
      label: 'Total Titles',
      value: entries.length.toString(),
      icon: TrendingUp,
      gradient: 'from-blue-600 to-purple-600',
      glow: 'shadow-glow',
      onClick: () => router.push('/my-list?tab=all&sort=title_asc'),
    },
    {
      label: 'Movies',
      value: movies.length.toString(),
      icon: Film,
      gradient: 'from-purple-600 to-pink-600',
      glow: 'shadow-glow-purple',
      onClick: () => router.push('/my-list?tab=movie&sort=title_asc'),
    },
    {
      label: 'Series',
      value: series.length.toString(),
      icon: Tv,
      gradient: 'from-blue-600 to-cyan-600',
      glow: 'shadow-glow',
      onClick: () => router.push('/my-list?tab=series&sort=title_asc'),
    },
    {
      label: 'Watch Time',
      value: formatWatchTime(totalHours),
      icon: Clock,
      gradient: 'from-amber-500 to-orange-600',
      glow: '',
      onClick: () => scrollToId('watch-history'),
    },
    {
      label: 'Avg Rating',
      value: ratedEntries.length > 0 ? avgRating.toFixed(1) : '—',
      icon: Star,
      gradient: 'from-yellow-500 to-amber-600',
      glow: '',
      onClick: () => scrollToId('top-rankings'),
    },
  ]

  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
      {stats.map((stat, i) => (
        <motion.div
          key={stat.label}
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: i * 0.08 }}
        >
          <GlassCard
            padding="sm"
            onClick={stat.onClick}
            className="hover:border-white/20 transition-all duration-300 cursor-pointer group"
            whileHover={{ y: -2, scale: 1.01 }}
          >
            <div className="flex flex-col gap-2">
              <div
                className={`w-8 h-8 rounded-lg bg-gradient-to-br ${stat.gradient} flex items-center justify-center ${stat.glow} group-hover:scale-110 transition-transform duration-200`}
              >
                <stat.icon className="w-4 h-4 text-white" />
              </div>
              <div>
                <p className="text-2xl font-bold text-white leading-none">{stat.value}</p>
                <p className="text-xs text-white/50 mt-1">{stat.label}</p>
              </div>
            </div>
          </GlassCard>
        </motion.div>
      ))}
    </div>
  )
}
