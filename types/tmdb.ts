export interface TMDBMovie {
  id: number
  title: string
  original_title: string
  overview: string
  poster_path: string | null
  backdrop_path: string | null
  release_date: string
  vote_average: number
  genre_ids: number[]
  genres?: TMDBGenre[]
  runtime?: number
  production_countries?: { iso_3166_1: string; name: string }[]
  status?: string
  adult: boolean
}

export interface TMDBSeries {
  id: number
  name: string
  original_name: string
  overview: string
  poster_path: string | null
  backdrop_path: string | null
  first_air_date: string
  vote_average: number
  genre_ids: number[]
  genres?: TMDBGenre[]
  number_of_episodes?: number
  number_of_seasons?: number
  episode_run_time?: number[]
  origin_country?: string[]
  status?: string
  next_episode_to_air?: { air_date: string } | null
  seasons?: {
    air_date: string | null
    episode_count: number
    id: number
    name: string
    overview: string
    poster_path: string | null
    season_number: number
    vote_average: number
  }[]
}

export interface TMDBGenre {
  id: number
  name: string
}

export interface TMDBSearchResult {
  page: number
  results: (TMDBMovie | TMDBSeries)[]
  total_pages: number
  total_results: number
}

export interface TMDBContentRating {
  iso_3166_1: string
  rating: string
}

export interface TMDBReleaseDateEntry {
  certification: string
  iso_639_1: string
  note: string
  release_date: string
  type: number
}

export interface TMDBReleaseDates {
  iso_3166_1: string
  release_dates: TMDBReleaseDateEntry[]
}

export type TMDBMediaType = 'movie' | 'tv'

export interface TMDBEpisode {
  episode_number: number
  name: string
  runtime: number | null
  air_date: string | null
  overview: string
}

export interface TMDBSeasonDetails {
  id: number
  name: string
  overview: string
  poster_path: string | null
  season_number: number
  air_date: string | null
  episodes: TMDBEpisode[]
}

/** Normalised season-level metadata returned by fetchSeasonMetadata(). */
export interface SeasonMetadata {
  seriesId: number
  seasonNumber: number
  /** TMDB season title, e.g. "Season 1" */
  title: string
  /** Year from the season air_date */
  year: number | null
  /** Number of episodes in this season */
  episodeCount: number
  /** Average runtime across all episodes that have a runtime (minutes) */
  avgRuntime: number | null
  posterUrl: string | null
}

export interface NormalizedTMDBResult {
  tmdbId: number
  title: string
  type: 'movie' | 'series'
  year: number | null
  /** Full TMDB release/air date string (e.g. "2023-05-12"). Used as a precise sort key. */
  releaseDate: string | null
  posterUrl: string | null
  backdropUrl: string | null
  genres: string[]
  country: string | null
  runtime: number | null
  totalEpisodes: number | null
  ageRating: string | null
  overview: string
}
