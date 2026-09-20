import { Timestamp } from 'firebase/firestore'
import type { MediaStatus, MediaType } from './media'

export type PublicTitleVisibility = 'inherit' | 'public' | 'private'

export interface PublicVisibilitySettings {
  statuses: Record<MediaStatus, boolean>
  types: Record<MediaType, boolean>
}

export const DEFAULT_PUBLIC_VISIBILITY: PublicVisibilitySettings = {
  statuses: {
    completed: false,
    watching: false,
    planned: false,
    on_hold: false,
    dropped: false,
  },
  types: {
    movie: false,
    series: false,
    shorts: false,
  },
}

export interface PublicStats {
  publicTitles: number
  movies: number
  series: number
  shorts: number
  completed: number
  watching: number
  watchHours: number
  averageRating: number | null
  completedThisYear: number
}

export interface PublicProfileDocument {
  username: string
  displayName: string
  profilePhotoUrl: string | null
  bio: string
  enabled: boolean
  showStats: boolean
  stats: PublicStats
  updatedAt?: Timestamp | null
}

export interface PublicTitleDocument {
  publicId: string
  title: string
  titleLower: string
  nativeTitle: string | null
  overview: string | null
  type: MediaType
  status: MediaStatus
  seasonNumber: number | null
  yearMade: number | null
  country: string | null
  genres: string[]
  ageRating: string | null
  tmdbId: number | null
  tmdbRating: number | null
  posterUrl: string | null
  backdropUrl: string | null
  totalEpisodes: number | null
  episodesWatched: number
  episodeDurationMinutes: number | null
  watchHours: number | null
  personalRating: number | null
  specialNotes: string | null
  dateFinished: Timestamp | null
  tmdbReleaseDate: string | null
  rewatchCount: number
  priority: number | null
  createdAt: Timestamp | null
  isPublic: true
}

export interface PublicListDocument {
  slug: string
  name: string
  description: string
  visibility: 'private' | 'public'
  titleIds: string[]
  createdAt?: Timestamp | null
  updatedAt?: Timestamp | null
}
