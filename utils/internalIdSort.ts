import { MediaEntry } from '@/types/media'
import { parseInternalIdNumber } from '@/utils/idGenerator'

export function getInternalIdSortNumber(entry: Pick<MediaEntry, 'internalId' | 'createdAt'>): number {
  return parseInternalIdNumber(entry.internalId) ?? entry.createdAt?.toMillis?.() ?? 0
}

export function compareInternalIdDescThenTitleAsc(a: MediaEntry, b: MediaEntry): number {
  const idDiff = getInternalIdSortNumber(b) - getInternalIdSortNumber(a)
  if (idDiff !== 0) return idDiff
  return a.title.localeCompare(b.title)
}

export function compareInternalIdAscThenTitleAsc(a: MediaEntry, b: MediaEntry): number {
  const idDiff = getInternalIdSortNumber(a) - getInternalIdSortNumber(b)
  if (idDiff !== 0) return idDiff
  return a.title.localeCompare(b.title)
}
