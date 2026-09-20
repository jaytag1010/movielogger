import type { Timestamp } from 'firebase/firestore'

export type FolderSort =
  | 'folder-order'
  | 'title-asc'
  | 'title-desc'
  | 'release-desc'
  | 'release-asc'
  | 'rating-desc'
  | 'rating-asc'
  | 'recently-updated'

interface SortableFolderTitle {
  title: string
  nativeTitle?: string | null
  yearMade?: number | null
  tmdbReleaseDate?: string | null
  personalRating?: number | null
  updatedAt?: Timestamp | null
}

function releaseTime(entry: SortableFolderTitle): number {
  const exact = entry.tmdbReleaseDate ? Date.parse(entry.tmdbReleaseDate) : Number.NaN
  if (Number.isFinite(exact)) return exact
  return entry.yearMade ? Date.UTC(entry.yearMade, 0, 1) : 0
}

function rating(entry: SortableFolderTitle): number | null {
  const value = Number(entry.personalRating)
  return Number.isFinite(value) && entry.personalRating != null ? value : null
}

export function sortFolderEntries<T extends SortableFolderTitle>(entries: T[], sort: FolderSort): T[] {
  if (sort === 'folder-order') return [...entries]
  return entries.map((entry, index) => ({ entry, index })).sort((a, b) => {
    let result = 0
    if (sort === 'title-asc' || sort === 'title-desc') {
      result = a.entry.title.localeCompare(b.entry.title)
      if (sort === 'title-desc') result *= -1
    } else if (sort === 'release-desc' || sort === 'release-asc') {
      const aRelease = releaseTime(a.entry)
      const bRelease = releaseTime(b.entry)
      if (!aRelease || !bRelease) result = aRelease ? -1 : bRelease ? 1 : 0
      else {
        result = aRelease - bRelease
        if (sort === 'release-desc') result *= -1
      }
    } else if (sort === 'rating-desc' || sort === 'rating-asc') {
      const aRating = rating(a.entry)
      const bRating = rating(b.entry)
      if (aRating == null || bRating == null) result = aRating != null ? -1 : bRating != null ? 1 : 0
      else {
        result = aRating - bRating
        if (sort === 'rating-desc') result *= -1
      }
    } else if (sort === 'recently-updated') {
      result = (b.entry.updatedAt?.toMillis?.() ?? 0) - (a.entry.updatedAt?.toMillis?.() ?? 0)
    }
    return result || a.entry.title.localeCompare(b.entry.title) || a.index - b.index
  }).map(({ entry }) => entry)
}

export const PUBLIC_FOLDER_SORT_OPTIONS: Array<{ value: FolderSort; label: string }> = [
  { value: 'title-asc', label: 'Title A-Z' },
  { value: 'title-desc', label: 'Title Z-A' },
  { value: 'release-desc', label: 'Release Date: Newest' },
  { value: 'release-asc', label: 'Release Date: Oldest' },
  { value: 'rating-desc', label: 'Rating: Highest' },
  { value: 'rating-asc', label: 'Rating: Lowest' },
]

export const OWNER_FOLDER_SORT_OPTIONS = [
  ...PUBLIC_FOLDER_SORT_OPTIONS,
  { value: 'recently-updated' as const, label: 'Recently Updated' },
]
