import { Timestamp } from 'firebase/firestore'
import { format, formatDistanceToNow } from 'date-fns'
import type { MediaEntry, MediaType } from '@/types/media'

export function formatDate(date: Timestamp | Date | null | undefined): string {
  if (!date) return '—'
  const d = date instanceof Timestamp ? date.toDate() : date
  return format(d, 'MMM d, yyyy')
}

export function formatDateRelative(date: Timestamp | Date | null | undefined): string {
  if (!date) return '—'
  const d = date instanceof Timestamp ? date.toDate() : date
  return formatDistanceToNow(d, { addSuffix: true })
}

export function formatWatchTime(hours: number | null | undefined): string {
  if (!hours || hours === 0) return '0h'
  if (hours < 1) {
    return `${Math.round(hours * 60)}m`
  }
  const h = Math.floor(hours)
  const m = Math.round((hours - h) * 60)
  if (m === 0) return `${h}h`
  return `${h}h ${m}m`
}

export function formatWatchTimeDetailed(totalHours: number): {
  years: number
  days: number
  hours: number
  minutes: number
} {
  const totalMinutes = Math.round(totalHours * 60)
  const minutes = totalMinutes % 60
  const totalHoursFloor = Math.floor(totalMinutes / 60)
  const hours = totalHoursFloor % 24
  const totalDays = Math.floor(totalHoursFloor / 24)
  const days = totalDays % 365
  const years = Math.floor(totalDays / 365)
  return { years, days, hours, minutes }
}

export function formatRating(rating: number | null | undefined): string {
  if (rating === null || rating === undefined) return '—'
  return rating.toFixed(1)
}

/**
 * Formats a watch-hours value as a decimal number with exactly two decimal
 * places followed by "h".  Use this wherever an individual entry's watch
 * hours (or an aggregate) must be rendered with full precision.
 *
 * Examples: 8.76 → "8.76h"   3101.17 → "3101.17h"   0 → "0.00h"
 */
export function formatWatchHours(hours: number | null | undefined): string {
  if (hours == null || hours === 0) return '0.00h'
  return `${hours.toFixed(2)}h`
}

export function formatNumber(n: number | null | undefined): string {
  if (n === null || n === undefined) return '—'
  return n.toLocaleString()
}

export function truncateText(text: string, maxLength: number): string {
  if (text.length <= maxLength) return text
  return `${text.slice(0, maxLength)}...`
}

export function capitalizeFirst(str: string): string {
  return str.charAt(0).toUpperCase() + str.slice(1)
}

export function formatGenres(genres: string[]): string {
  if (!genres || genres.length === 0) return '—'
  return genres.slice(0, 3).join(', ')
}

/**
 * Returns the human-readable display title for a media entry.
 *
 * When a series entry has a seasonNumber, the title is rendered as
 * "Series Name — Season N" so that multiple seasons of the same series
 * are visually distinct everywhere in the UI.
 *
 * Works with both MediaEntry objects and import MappedRow objects.
 */
export function getDisplayTitle(entry: {
  title: string
  seasonNumber?: number | null
}): string {
  if (entry.seasonNumber != null && entry.seasonNumber > 1) {
    return `${entry.title} — Season ${entry.seasonNumber}`
  }
  return entry.title
}

/**
 * Derives the effective media type using a strict authority hierarchy:
 *
 *  1. TMDB-linked entry  → stored `type` was set authoritatively by TMDB.
 *  2. Unlinked entry with totalEpisodes > 1  → 'series' (structural signal).
 *  3. Unlinked entry with totalEpisodes <= 1 → 'movie'  (structural signal).
 *  4. Fallback (no episode data) → stored `type`.
 *
 * Title patterns (Season 1, Part 2, etc.) are deliberately NOT used because
 * movie franchises share the same naming conventions.
 *
 * This is the single source of truth for media-type classification across
 * My List, Dashboard, Top Rankings, Statistics, and Progress.
 */
/**
 * Episodes the user has watched for an entry.
 *
 * Canonical storage is the `nextEpisodeToWatch` field, which the progress UI
 * has always displayed directly as the watched count (0 = none watched).
 * This helper migrates safely: existing values are preserved 1:1, and a
 * missing value defaults to 0. Movies use an effective total of 1.
 */
export function getEpisodesWatched(
  entry: Pick<MediaEntry, 'nextEpisodeToWatch'>
): number {
  return entry.nextEpisodeToWatch ?? 0
}

export function getEffectiveMediaType(
  entry: Pick<MediaEntry, 'tmdbId' | 'type' | 'totalEpisodes'>
): MediaType {
  // TMDB-linked: type was set by TMDB — highest authority
  if (entry.tmdbId != null) {
    return entry.type
  }
  // Unlinked: classify purely by episode count.
  //   > 1 episode  → series
  //   <= 1 episode → movie
  if (entry.totalEpisodes != null) {
    return entry.totalEpisodes > 1 ? 'series' : 'movie'
  }
  // No episode data — default to stored type
  return entry.type
}

/**
 * Returns the best available poster URL for an entry using the priority:
 *   1. TMDB poster  (official artwork, highest quality)
 *   2. Manual poster (user-uploaded fallback)
 *   3. null         (caller shows placeholder)
 */
export function getDisplayPosterUrl(
  entry: Pick<MediaEntry, 'posterUrl' | 'manualPosterUrl'>
): string | null {
  return entry.posterUrl || entry.manualPosterUrl || null
}
