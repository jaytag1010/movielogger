import { MediaEntry } from '@/types/media'

export function getWatchHistoryYear(entry: MediaEntry, currentYear = new Date().getFullYear()): number | null {
  if (entry.status !== 'completed') return null

  const year = entry.dateFinished
    ? entry.dateFinished.toDate().getFullYear()
    : entry.yearMade

  return year != null && year >= 1990 && year <= currentYear ? year : null
}

export function getWatchHistoryEntries(entries: MediaEntry[], year: number): MediaEntry[] {
  return entries.filter((entry) => getWatchHistoryYear(entry) === year)
}
