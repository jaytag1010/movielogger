import type { MediaEntry, MediaType } from '@/types/media'
import type { SystemListConfig, SystemListType } from '@/types/public'
import { getEffectiveMediaType } from '@/utils/formatters'
import { getEligibleCompletedRankedEntries, topDenseRanked } from '@/utils/ranking'

export interface SystemListDefinition {
  type: SystemListType
  name: string
  description: string
}

export const SYSTEM_LISTS: SystemListDefinition[] = [
  { type: 'all-titles', name: 'All Titles', description: 'Every title in your library.' },
  { type: 'movies', name: 'Movies', description: 'All titles classified as movies.' },
  { type: 'series', name: 'Series', description: 'All titles classified as series.' },
  { type: 'shorts', name: 'Shorts', description: 'All titles classified as shorts.' },
  { type: 'top-10-movies', name: 'Top 10 Movies', description: 'Completed movies ranked 1 through 10, including ties.' },
  { type: 'top-10-series', name: 'Top 10 Series', description: 'Completed series ranked 1 through 10, including ties.' },
  { type: 'top-10-shorts', name: 'Top 10 Shorts', description: 'Completed shorts ranked 1 through 10, including ties.' },
]

export const DEFAULT_SYSTEM_LIST_CONFIG: SystemListConfig = {
  visibility: 'private',
  autoUpdate: true,
  snapshotEntryIds: [],
}

export function getSystemListConfig(
  configs: Partial<Record<SystemListType, SystemListConfig>> | undefined,
  type: SystemListType
): SystemListConfig {
  const value = configs?.[type]
  return {
    visibility: value?.visibility === 'public' ? 'public' : 'private',
    autoUpdate: value?.autoUpdate !== false,
    snapshotEntryIds: Array.isArray(value?.snapshotEntryIds) ? value.snapshotEntryIds : [],
  }
}

function systemMediaType(type: SystemListType): MediaType | null {
  if (type.includes('movie')) return 'movie'
  if (type.includes('series')) return 'series'
  if (type.includes('short')) return 'shorts'
  return null
}

export function deriveSystemListEntries(type: SystemListType, entries: MediaEntry[]): MediaEntry[] {
  if (type === 'all-titles') return [...entries]
  const mediaType = systemMediaType(type)
  const typed = entries.filter((entry) => getEffectiveMediaType(entry) === mediaType)
  if (!type.startsWith('top-10-')) return typed
  return topDenseRanked(getEligibleCompletedRankedEntries(typed), 10).map((item) => item.entry)
}

export function resolveSystemListEntries(
  type: SystemListType,
  config: SystemListConfig,
  entries: MediaEntry[]
): MediaEntry[] {
  if (config.autoUpdate) return deriveSystemListEntries(type, entries)
  const byId = new Map(entries.filter((entry) => entry.id).map((entry) => [entry.id!, entry]))
  return config.snapshotEntryIds.map((id) => byId.get(id)).filter(Boolean) as MediaEntry[]
}

export function isSystemListType(value: string): value is SystemListType {
  return SYSTEM_LISTS.some((item) => item.type === value)
}
