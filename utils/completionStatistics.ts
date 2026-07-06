import { MediaEntry, MediaType } from '@/types/media'
import { calculateEntryWatchHours } from '@/utils/watchTime'

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

function hasRankedRating(entry: MediaEntry): boolean {
  return entry.personalRating != null && entry.personalRating > 0
}

function finishedAt(entry: MediaEntry): number {
  return entry.dateFinished?.toMillis() ?? 0
}

function compareCompletedRatings(a: MediaEntry, b: MediaEntry): number {
  const ratingDiff = (b.personalRating ?? 0) - (a.personalRating ?? 0)
  if (ratingDiff !== 0) return ratingDiff

  const dateDiff = finishedAt(b) - finishedAt(a)
  if (dateDiff !== 0) return dateDiff

  return a.title.localeCompare(b.title)
}

function isSameEntry(a: MediaEntry, b: MediaEntry): boolean {
  if (a.id && b.id) return a.id === b.id
  return a.internalId === b.internalId
}

function rankInPool(entry: MediaEntry, pool: MediaEntry[]): CompletionRank | null {
  if (!hasRankedRating(entry)) return null
  const ranked = pool.filter(hasRankedRating).sort(compareCompletedRatings)
  const index = ranked.findIndex((candidate) => isSameEntry(candidate, entry))
  return index >= 0 ? { rank: index + 1, total: ranked.length } : null
}

export function calculateCompletionStatistics(
  entry: MediaEntry,
  libraryEntries: MediaEntry[]
): CompletionStatistics {
  const completed = libraryEntries.filter((candidate) => candidate.status === 'completed')
  const ratedCompleted = completed.filter(hasRankedRating)
  const overallRank = rankInPool(entry, completed)
  const sameType = completed.filter((candidate) => candidate.type === entry.type)
  const typeRank = rankInPool(entry, sameType)
  const sameCountry = entry.country
    ? completed.filter((candidate) => candidate.country === entry.country)
    : []
  const countryRank = entry.country ? rankInPool(entry, sameCountry) : null
  const uniqueGenres = Array.from(new Set((entry.genres ?? []).filter(Boolean)))
  const genreRanks = uniqueGenres.flatMap((genre) => {
    const pool = completed.filter((candidate) => candidate.genres?.includes(genre))
    const result = rankInPool(entry, pool)
    return result ? [{ genre, ...result }] : []
  })

  const ratingPercentile = hasRankedRating(entry) && ratedCompleted.length > 0
    ? Math.round(
        ratedCompleted.filter((candidate) =>
          (candidate.personalRating ?? 0) < (entry.personalRating ?? 0)
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
    achievements.add(entry.type === 'movie' ? 'Highest Rated Movie' : 'Highest Rated Series')
  }
  if (countryRank?.rank === 1 && entry.country) {
    achievements.add(`Highest Rated ${entry.country} Title`)
  }
  genreRanks.filter((rank) => rank.rank === 1).forEach((rank) => achievements.add(`Top ${rank.genre}`))
  if (overallRank && overallRank.rank > 1 && overallRank.rank <= 10) {
    achievements.add('Entered Overall Top 10')
  }

  const otherCompleted = completed.filter((candidate) => !isSameEntry(candidate, entry))
  if (entry.type === 'series' && (entry.totalEpisodes ?? 0) > 0) {
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
    type: entry.type,
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
