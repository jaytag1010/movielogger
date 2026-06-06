import { Timestamp } from 'firebase/firestore'

export type MediaType = 'movie' | 'series'

export type MediaStatus =
  | 'completed'
  | 'watching'
  | 'planned'
  | 'dropped'
  | 'on_hold'

export interface MediaEntry {
  id?: string
  internalId: string
  /** Preserved from the source Excel/CSV ID column during import. Never used as primary key. */
  legacyId?: string | null
  /**
   * Season number for TV series tracked per-season (e.g. 1, 2, 3).
   * null means the entry covers the entire series or the season is unknown.
   */
  seasonNumber: number | null
  /**
   * For series in progress: the next episode the user should watch.
   * nextEpisodeToWatch = N means episodes 1…N-1 have been watched.
   * null = position unknown (imported "Watching" with no episode data).
   * Clamped to [1, totalEpisodes] when totalEpisodes is known.
   * Not used for movies.
   */
  nextEpisodeToWatch: number | null
  tmdbId: number | null
  title: string
  type: MediaType
  yearMade: number | null
  totalEpisodes: number | null
  episodeDurationMinutes: number | null
  watchHours: number | null
  personalRating: number | null
  ageRating: string | null
  genres: string[]
  country: string | null
  status: MediaStatus
  dateFinished: Timestamp | null
  specialNotes: string | null
  posterUrl: string | null
  backdropUrl: string | null
  /** User-uploaded poster stored in Firebase Storage. Shown only when posterUrl is absent. */
  manualPosterUrl: string | null
  createdAt: Timestamp
  updatedAt: Timestamp
  userId: string
}

export type MediaEntryInput = Omit<MediaEntry, 'id' | 'internalId' | 'createdAt' | 'updatedAt'>

export type MediaEntryUpdate = Partial<Omit<MediaEntry, 'id' | 'internalId' | 'userId' | 'createdAt'>>

export const MEDIA_STATUS_LABELS: Record<MediaStatus, string> = {
  completed: 'Completed',
  watching: 'Watching',
  planned: 'Planned',
  dropped: 'Dropped',
  on_hold: 'On Hold',
}

export const MEDIA_STATUS_COLORS: Record<MediaStatus, string> = {
  completed: 'text-emerald-400 bg-emerald-400/10 border-emerald-400/20',
  watching: 'text-blue-400 bg-blue-400/10 border-blue-400/20',
  planned: 'text-purple-400 bg-purple-400/10 border-purple-400/20',
  dropped: 'text-red-400 bg-red-400/10 border-red-400/20',
  on_hold: 'text-amber-400 bg-amber-400/10 border-amber-400/20',
}

export interface MediaFilters {
  search: string
  type: MediaType | 'all'
  status: MediaStatus | 'all'
  genre: string | 'all'
  country: string | 'all'
  year: string | 'all'
  ageRating: string | 'all'
  sortBy: 'title' | 'rating' | 'year' | 'dateFinished' | 'createdAt'
  sortOrder: 'asc' | 'desc'
}

export const DEFAULT_FILTERS: MediaFilters = {
  search: '',
  type: 'all',
  status: 'all',
  genre: 'all',
  country: 'all',
  year: 'all',
  ageRating: 'all',
  sortBy: 'createdAt',
  sortOrder: 'desc',
}
