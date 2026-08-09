import { MediaEntry } from '@/types/media'
import { getDisplayTitle } from '@/utils/formatters'
import { parseInternalIdNumber } from '@/utils/idGenerator'
import { normalizeCountry } from '@/utils/countries'

export interface DenseRankedEntry {
  entry: MediaEntry
  rank: number
}

export function hasRankedRating(entry: MediaEntry): boolean {
  const rating = Number(entry.personalRating)
  return Number.isFinite(rating) && rating > 0
}

export function isEligibleForCompletionRanking(entry: MediaEntry): boolean {
  return entry.status === 'completed' && hasRankedRating(entry)
}

export function getEligibleCompletedRankedEntries(entries: MediaEntry[]): MediaEntry[] {
  return entries.filter(isEligibleForCompletionRanking)
}

export function sameNormalizedCountry(a?: string | null, b?: string | null): boolean {
  if (!a || !b) return false
  return normalizeCountry(a) === normalizeCountry(b)
}

function finishedAt(entry: MediaEntry): number {
  return entry.dateFinished?.toMillis() ?? 0
}

function internalIdValue(entry: MediaEntry): number {
  return parseInternalIdNumber(entry.internalId) ?? Number.MAX_SAFE_INTEGER
}

export function isSameEntry(a: MediaEntry, b: MediaEntry): boolean {
  if (a.id && b.id) return a.id === b.id
  return a.internalId === b.internalId
}

export function compareRankedEntries(a: MediaEntry, b: MediaEntry): number {
  const ratingDiff = Number(b.personalRating ?? 0) - Number(a.personalRating ?? 0)
  if (ratingDiff !== 0) return ratingDiff

  const dateDiff = finishedAt(b) - finishedAt(a)
  if (dateDiff !== 0) return dateDiff

  const idDiff = internalIdValue(a) - internalIdValue(b)
  if (idDiff !== 0) return idDiff

  return getDisplayTitle(a).localeCompare(getDisplayTitle(b))
}

export function withDenseRanks(entries: MediaEntry[]): DenseRankedEntry[] {
  const ranked = entries.filter(hasRankedRating).sort(compareRankedEntries)
  let currentRank = 0
  let previousRating: number | null = null

  return ranked.map((entry) => {
    const rating = entry.personalRating ?? 0
    if (previousRating == null || rating !== previousRating) {
      currentRank += 1
      previousRating = rating
    }
    return { entry, rank: currentRank }
  })
}

export function topDenseRanked(entries: MediaEntry[], maxRank = 10): DenseRankedEntry[] {
  return withDenseRanks(entries).filter((item) => item.rank <= maxRank)
}

export function getDenseRankForEntry(
  entry: MediaEntry,
  pool: MediaEntry[]
): { rank: number; total: number } | null {
  if (!hasRankedRating(entry)) return null
  const ranked = withDenseRanks(pool)
  const match = ranked.find((item) => isSameEntry(item.entry, entry))
  return match ? { rank: match.rank, total: ranked.length } : null
}
