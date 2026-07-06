'use client'

import { Award, Clock, Library, RotateCcw, Sparkles, Star, Trophy } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { CompletionRank, CompletionStatistics } from '@/utils/completionStatistics'
import { formatWatchTime, getDisplayTitle } from '@/utils/formatters'

interface CompletionStatisticsModalProps {
  statistics: CompletionStatistics | null
  onClose: () => void
}

function RankBlock({ label, rank }: { label: string; rank: CompletionRank }) {
  return (
    <div className="rounded-lg border border-white/10 bg-white/[0.04] p-3">
      <p className="text-[10px] uppercase text-white/35">{label}</p>
      <p className="mt-1 text-lg font-bold text-white">
        #{rank.rank} <span className="text-xs font-normal text-white/40">of {rank.total}</span>
      </p>
    </div>
  )
}

export function CompletionStatisticsModal({
  statistics,
  onClose,
}: CompletionStatisticsModalProps) {
  if (!statistics) return null

  const {
    entry,
    overallRank,
    typeRank,
    countryRank,
    genreRanks,
    ratingPercentile,
    watchHoursAdded,
    completedCount,
    libraryCount,
    completionPercent,
    rewatchCount,
    achievements,
  } = statistics
  const typeLabel = entry.type === 'movie' ? 'Movie' : 'Series'
  const hasRating = entry.personalRating != null && entry.personalRating > 0

  return (
    <Dialog open onOpenChange={(open) => { if (!open) onClose() }}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-emerald-400">
            <Trophy className="h-5 w-5" />
            Congratulations!
          </DialogTitle>
        </DialogHeader>

        <div className="-mt-1 border-b border-white/10 pb-3">
          <p className="text-xs text-white/40">You completed</p>
          <p className="mt-0.5 text-base font-semibold text-white">{getDisplayTitle(entry)}</p>
          <p className="mt-1 flex items-center gap-1.5 text-sm text-white/60">
            <Star className="h-3.5 w-3.5 text-amber-400" />
            {hasRating ? `Rating: ${entry.personalRating!.toFixed(2)}` : 'Not rated'}
          </p>
        </div>

        {overallRank ? (
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
            <RankBlock label="Overall Rank" rank={overallRank} />
            {typeRank && <RankBlock label={`${typeLabel} Rank`} rank={typeRank} />}
            {countryRank && entry.country && <RankBlock label={`${entry.country} Rank`} rank={countryRank} />}
          </div>
        ) : (
          <div className="rounded-lg border border-white/10 bg-white/[0.04] px-3 py-2.5">
            <p className="text-sm font-medium text-white/70">Not ranked yet</p>
            <p className="text-xs text-white/35">Add a personal rating to calculate library rankings.</p>
          </div>
        )}

        {genreRanks.length > 0 && (
          <div>
            <p className="mb-2 text-xs font-semibold text-white/60">Genre Rankings</p>
            <div className="grid grid-cols-1 gap-1.5 sm:grid-cols-2">
              {genreRanks.map((genre) => (
                <div key={genre.genre} className="flex items-center justify-between rounded-lg bg-white/[0.04] px-3 py-2 text-xs">
                  <span className="truncate text-white/55">{genre.genre}</span>
                  <span className="ml-2 font-semibold text-white">#{genre.rank} of {genre.total}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {ratingPercentile != null && (
          <div className="rounded-lg border border-blue-500/20 bg-blue-500/10 px-3 py-2 text-center text-sm text-blue-300">
            Better than <span className="font-bold">{ratingPercentile}%</span> of your completed library
          </div>
        )}

        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          <div className="rounded-lg border border-white/10 bg-white/[0.04] p-3">
            <div className="flex items-center gap-1.5 text-[10px] uppercase text-white/35">
              <Clock className="h-3.5 w-3.5" /> Watch Time Added
            </div>
            <p className="mt-1 text-base font-semibold text-white">
              {watchHoursAdded != null ? formatWatchTime(watchHoursAdded) : 'Watch time unavailable'}
            </p>
          </div>
          <div className="rounded-lg border border-white/10 bg-white/[0.04] p-3">
            <div className="flex items-center gap-1.5 text-[10px] uppercase text-white/35">
              <Library className="h-3.5 w-3.5" /> Library Progress
            </div>
            <p className="mt-1 text-base font-semibold text-white">{completedCount} / {libraryCount} Completed</p>
            <p className="text-xs text-white/40">{completionPercent.toFixed(1)}% Complete</p>
          </div>
        </div>

        {rewatchCount > 0 && (
          <div className="flex items-center justify-between rounded-lg border border-purple-500/20 bg-purple-500/10 px-3 py-2">
            <div className="flex items-center gap-2 text-sm text-purple-300">
              <RotateCcw className="h-4 w-4" /> Rewatch Information
            </div>
            <div className="text-right text-xs text-white/55">
              <p className="font-semibold text-white">Total Watches: {1 + rewatchCount}</p>
              <p>{rewatchCount} rewatch{rewatchCount === 1 ? '' : 'es'}</p>
            </div>
          </div>
        )}

        {achievements.length > 0 && (
          <div>
            <p className="mb-2 flex items-center gap-1.5 text-xs font-semibold text-white/60">
              <Award className="h-3.5 w-3.5 text-emerald-400" /> Achievements
            </p>
            <div className="flex flex-wrap gap-1.5">
              {achievements.map((achievement) => (
                <span key={achievement} className="inline-flex items-center gap-1 rounded-full border border-emerald-500/20 bg-emerald-500/10 px-2.5 py-1 text-xs text-emerald-300">
                  <Sparkles className="h-3 w-3" /> {achievement}
                </span>
              ))}
            </div>
          </div>
        )}

        <Button className="w-full bg-emerald-600 text-white hover:bg-emerald-700" onClick={onClose}>
          Close
        </Button>
      </DialogContent>
    </Dialog>
  )
}
