import type { MediaEntry } from '@/types/media'
import {
  DEFAULT_PUBLIC_VISIBILITY,
  PublicStats,
  PublicTitleDocument,
  PublicVisibilitySettings,
} from '@/types/public'
import { getEffectiveMediaType, getEpisodesWatched } from '@/utils/formatters'
import { calculateEntryWatchHours } from '@/utils/watchTime'

export function normalizePublicVisibility(
  value?: Partial<PublicVisibilitySettings> | null
): PublicVisibilitySettings {
  return {
    statuses: { ...DEFAULT_PUBLIC_VISIBILITY.statuses, ...(value?.statuses ?? {}) },
    types: { ...DEFAULT_PUBLIC_VISIBILITY.types, ...(value?.types ?? {}) },
  }
}

export function toPublicTitle(entry: MediaEntry, publicId: string): PublicTitleDocument {
  const type = getEffectiveMediaType(entry)
  return {
    publicId,
    title: entry.title,
    titleLower: entry.title.trim().toLocaleLowerCase(),
    nativeTitle: entry.nativeTitle ?? null,
    overview: entry.overview ?? null,
    type,
    status: entry.status,
    seasonNumber: entry.seasonNumber ?? null,
    yearMade: entry.yearMade ?? null,
    country: entry.country ?? null,
    genres: entry.genres ?? [],
    ageRating: entry.ageRating ?? null,
    tmdbId: entry.tmdbId ?? null,
    tmdbRating: entry.tmdbRating ?? null,
    posterUrl: entry.manualPosterUrl || entry.posterUrl || null,
    backdropUrl: entry.backdropUrl ?? null,
    totalEpisodes: entry.totalEpisodes ?? (type === 'movie' ? 1 : null),
    episodesWatched: getEpisodesWatched(entry),
    episodeDurationMinutes: entry.episodeDurationMinutes ?? null,
    watchHours: calculateEntryWatchHours(entry),
    personalRating: entry.personalRating ?? null,
    specialNotes: entry.specialNotes ?? null,
    dateFinished: entry.dateFinished ?? null,
    tmdbReleaseDate: entry.tmdbReleaseDate ?? null,
    rewatchCount: entry.rewatchCount ?? 0,
    priority: entry.priority ?? null,
    createdAt: entry.createdAt ?? null,
    folderVisible: true,
    isPublic: true,
  }
}

export function calculatePublicStats(entries: MediaEntry[]): PublicStats {
  const ratings = entries
    .map((entry) => entry.personalRating)
    .filter((rating): rating is number => rating != null && Number.isFinite(rating) && rating > 0)
  const currentYear = new Date().getFullYear()
  const types = entries.map(getEffectiveMediaType)
  return {
    publicTitles: entries.length,
    movies: types.filter((type) => type === 'movie').length,
    series: types.filter((type) => type === 'series').length,
    shorts: types.filter((type) => type === 'shorts').length,
    completed: entries.filter((entry) => entry.status === 'completed').length,
    watching: entries.filter((entry) => entry.status === 'watching').length,
    planned: entries.filter((entry) => entry.status === 'planned').length,
    onHold: entries.filter((entry) => entry.status === 'on_hold').length,
    dropped: entries.filter((entry) => entry.status === 'dropped').length,
    watchHours: entries
      .filter((entry) => entry.status === 'completed')
      .reduce((sum, entry) => sum + calculateEntryWatchHours(entry), 0),
    averageRating: ratings.length > 0
      ? ratings.reduce((sum, rating) => sum + rating, 0) / ratings.length
      : null,
    completedThisYear: entries.filter((entry) => (
      entry.status === 'completed' && entry.dateFinished?.toDate().getFullYear() === currentYear
    )).length,
  }
}

export function slugifyPublicList(value: string): string {
  return value
    .trim()
    .toLocaleLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60)
}
