import { MediaEntry } from '@/types/media'

interface WatchHourOptions {
  includeRewatchHours?: boolean
}

export function calculateEntryWatchHours(entry: MediaEntry, options: WatchHourOptions = {}): number {
  const applyRewatchMultiplier = (hours: number) => {
    if (!options.includeRewatchHours || entry.status !== 'completed') return hours
    return hours * (1 + Math.max(0, entry.rewatchCount ?? 0))
  }

  if (entry.watchHours && entry.watchHours > 0) {
    return applyRewatchMultiplier(entry.watchHours)
  }
  if (entry.totalEpisodes && entry.episodeDurationMinutes) {
    return applyRewatchMultiplier((entry.totalEpisodes * entry.episodeDurationMinutes) / 60)
  }
  if (entry.episodeDurationMinutes) {
    return applyRewatchMultiplier(entry.episodeDurationMinutes / 60)
  }
  return 0
}

export function calculateTotalWatchHours(entries: MediaEntry[], options: WatchHourOptions = {}): number {
  return entries.reduce((total, entry) => {
    return total + calculateEntryWatchHours(entry, options)
  }, 0)
}

export interface WatchTimeProjection {
  totalHours: number
  yearsToFinish: number
  daysToFinish: number
  hoursRemaining: number
  minutesRemaining: number
  formattedTime: string
}

export function calculateWatchTimeProjection(
  entries: MediaEntry[],
  hoursPerDay: number,
  options: WatchHourOptions = {}
): WatchTimeProjection {
  const totalHours = calculateTotalWatchHours(entries, options)

  if (hoursPerDay <= 0) {
    return {
      totalHours,
      yearsToFinish: 0,
      daysToFinish: 0,
      hoursRemaining: 0,
      minutesRemaining: 0,
      formattedTime: '0 days',
    }
  }

  const totalDays = totalHours / hoursPerDay
  const years = Math.floor(totalDays / 365)
  const remainingDays = Math.floor(totalDays % 365)
  const remainingHours = Math.floor((totalDays - Math.floor(totalDays)) * hoursPerDay)
  const remainingMinutes = Math.round(
    ((totalDays - Math.floor(totalDays)) * hoursPerDay - remainingHours) * 60
  )

  const parts: string[] = []
  if (years > 0) parts.push(`${years} year${years !== 1 ? 's' : ''}`)
  if (remainingDays > 0) parts.push(`${remainingDays} day${remainingDays !== 1 ? 's' : ''}`)
  if (remainingHours > 0 && years === 0) parts.push(`${remainingHours}h`)
  if (remainingMinutes > 0 && years === 0 && remainingDays === 0) {
    parts.push(`${remainingMinutes}m`)
  }

  return {
    totalHours,
    yearsToFinish: years,
    daysToFinish: remainingDays,
    hoursRemaining: remainingHours,
    minutesRemaining: remainingMinutes,
    formattedTime: parts.length > 0 ? parts.join(', ') : 'Less than a minute',
  }
}
