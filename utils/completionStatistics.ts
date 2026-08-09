import { MediaEntry, MediaType } from '@/types/media'
import { calculateEntryWatchHours } from '@/utils/watchTime'
import {
  getDenseRankForEntry,
  getEligibleCompletedRankedEntries,
  hasRankedRating,
  isSameEntry,
  sameNormalizedCountry,
} from '@/utils/ranking'
import { getEffectiveMediaType } from '@/utils/formatters'

export interface CompletionRank {
  rank: number
  total: number
}

export interface GenreCompletionRank extends CompletionRank {
  genre: string
}

export interface CompletionStatistics {
  entry: MediaEntry
  overallRank: CompletionRank | null
  typeRank: CompletionRank | null
  type: MediaType
  countryRank: CompletionRank | null
  genreRanks: GenreCompletionRank[]
  ratingPercentile: number | null
  watchHoursAdded: number | null
  completedCount: number
  libraryCount: number
  completionPercent: number
  rewatchCount: number
  achievements: string[]
}

function rankInPool(entry: MediaEntry, pool: MediaEntry[]): CompletionRank | null {
  return getDenseRankForEntry(entry, pool)
}

export function calculateCompletionStatistics(
  entry: MediaEntry,
  libraryEntries: MediaEntry[]
): CompletionStatistics {
  const completed = libraryEntries.filter((candidate) => candidate.status === 'completed')
  const ratedCompleted = getEligibleCompletedRankedEntries(libraryEntries)
  const entryType = getEffectiveMediaType(entry)
  const overallRank = rankInPool(entry, ratedCompleted)
  const sameType = ratedCompleted.filter((candidate) => getEffectiveMediaType(candidate) === entryType)
  const typeRank = rankInPool(entry, sameType)
  const sameCountry = entry.country
    ? ratedCompleted.filter((candidate) => sameNormalizedCountry(candidate.country, entry.country))
    : []
  const countryRank = entry.country ? rankInPool(entry, sameCountry) : null
  const uniqueGenres = Array.from(new Set((entry.genres ?? []).filter(Boolean)))
  const genreRanks = uniqueGenres.flatMap((genre) => {
    const pool = ratedCompleted.filter((candidate) => candidate.genres?.includes(genre))
    const result = rankInPool(entry, pool)
    return result ? [{ genre, ...result }] : []
  })

  const ratingPercentile = hasRankedRating(entry) && ratedCompleted.length > 0
    ? Math.round(
        ratedCompleted.filter((candidate) =>
          Number(candidate.personalRating ?? 0) < Number(entry.personalRating ?? 0)
        ).length / ratedCompleted.length * 100
      )
    : null

  const calculatedWatchHours = calculateEntryWatchHours(entry)
  const watchHoursAdded = calculatedWatchHours > 0 ? calculatedWatchHours : null
  const libraryCount = libraryEntries.length
  const completedCount = completed.length
  const completionPercent = libraryCount > 0 ? completedCount / libraryCount * 100 : 0
  const rewatchCount = Math.max(0, entry.rewatchCount ?? 0)

  const achievements = new Set<string>()
  if (overallRank?.rank === 1) achievements.add('New #1 Overall')
  if (typeRank?.rank === 1) {
    achievements.add(entryType === 'movie' ? 'Highest Rated Movie' : 'Highest Rated Series')
  }
  if (countryRank?.rank === 1 && entry.country) {
    achievements.add(`Highest Rated ${entry.country} Title`)
  }
  genreRanks.filter((rank) => rank.rank === 1).forEach((rank) => achievements.add(`Top ${rank.genre}`))
  if (overallRank && overallRank.rank > 1 && overallRank.rank <= 10) {
    achievements.add('Entered Overall Top 10')
  }

  const otherCompleted = completed.filter((candidate) => !isSameEntry(candidate, entry))
  if (entryType === 'series' && (entry.totalEpisodes ?? 0) > 0) {
    const longestPreviousSeries = Math.max(
      0,
      ...otherCompleted
        .filter((candidate) => candidate.type === 'series')
        .map((candidate) => candidate.totalEpisodes ?? 0)
    )
    if ((entry.totalEpisodes ?? 0) > longestPreviousSeries) {
      achievements.add('Longest Series Completed')
    }
  }

  if (watchHoursAdded != null) {
    const previousLargestWatchTime = Math.max(
      0,
      ...otherCompleted.map((candidate) => calculateEntryWatchHours(candidate))
    )
    if (watchHoursAdded > previousLargestWatchTime) {
      achievements.add('Biggest Watch Time Added')
    }
  }

  if (
    entry.personalRating === 10 &&
    !otherCompleted.some((candidate) => candidate.personalRating === 10)
  ) {
    achievements.add('First Perfect 10.0 Rating')
  }

  return {
    entry,
    overallRank,
    typeRank,
    type: entryType,
    countryRank,
    genreRanks,
    ratingPercentile,
    watchHoursAdded,
    completedCount,
    libraryCount,
    completionPercent,
    rewatchCount,
    achievements: Array.from(achievements),
  }
}
