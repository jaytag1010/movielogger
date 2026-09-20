import type { MediaEntry } from '@/types/media'
import type { PublicTitleDocument } from '@/types/public'
import { getEpisodesWatched } from '@/utils/formatters'

export type ProjectionMode = 'remaining' | 'full'
export type ProjectionEntry = MediaEntry | PublicTitleDocument

export interface ListProjectionResult {
  selectedCount: number
  includedCount: number
  excludedCount: number
  totalEpisodes: number
  baseHours: number
  projectedHours: number
}

export function calculateListProjection(entries: ProjectionEntry[], mode: ProjectionMode, speed: number): ListProjectionResult {
  let includedCount = 0
  let excludedCount = 0
  let totalEpisodes = 0
  let minutes = 0
  entries.forEach((entry) => {
    const duration = Number(entry.episodeDurationMinutes)
    const total = Number(entry.totalEpisodes)
    if (!Number.isFinite(duration) || duration <= 0 || !Number.isFinite(total) || total <= 0) {
      excludedCount += 1
      return
    }
    const watched = 'nextEpisodeToWatch' in entry
      ? getEpisodesWatched(entry)
      : Math.max(0, Number(entry.episodesWatched ?? 0))
    const episodes = mode === 'remaining'
      ? entry.status === 'completed' ? 0 : Math.max(0, total - watched)
      : total
    includedCount += 1
    totalEpisodes += episodes
    minutes += episodes * duration
  })
  const baseHours = minutes / 60
  return { selectedCount: entries.length, includedCount, excludedCount, totalEpisodes, baseHours, projectedHours: speed > 0 ? baseHours / speed : baseHours }
}
