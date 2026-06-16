import {
  TMDBMovie,
  TMDBSeries,
  TMDBGenre,
  TMDBSeasonDetails,
  SeasonMetadata,
  NormalizedTMDBResult,
  TMDBMediaType,
} from '@/types/tmdb'
import { normalizeCountry } from '@/utils/countries'

const BASE_URL = process.env.NEXT_PUBLIC_TMDB_BASE_URL || 'https://api.themoviedb.org/3'
const IMAGE_BASE = process.env.NEXT_PUBLIC_TMDB_IMAGE_BASE_URL || 'https://image.tmdb.org/t/p'
const API_KEY = process.env.NEXT_PUBLIC_TMDB_API_KEY

const TMDB_TIMEOUT_MS = 10_000

async function tmdbFetch<T>(path: string, params: Record<string, string> = {}): Promise<T> {
  const url = new URL(`${BASE_URL}${path}`)
  url.searchParams.set('api_key', API_KEY || '')
  url.searchParams.set('language', 'en-US')
  Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, v))

  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), TMDB_TIMEOUT_MS)

  try {
    const res = await fetch(url.toString(), { signal: controller.signal })
    if (!res.ok) {
      throw new Error(`TMDB API error: ${res.status} ${res.statusText}`)
    }
    return res.json()
  } finally {
    clearTimeout(timer)
  }
}

export function getTMDBImageUrl(path: string | null, size = 'w500'): string | null {
  if (!path) return null
  return `${IMAGE_BASE}/${size}${path}`
}

export async function searchMovies(query: string, year?: number): Promise<TMDBMovie[]> {
  const params: Record<string, string> = { query }
  if (year) params.year = String(year)

  const data = await tmdbFetch<{ results: TMDBMovie[] }>('/search/movie', params)
  return data.results.slice(0, 10)
}

export async function searchTVSeries(query: string, year?: number): Promise<TMDBSeries[]> {
  const params: Record<string, string> = { query }
  if (year) params.first_air_date_year = String(year)

  const data = await tmdbFetch<{ results: TMDBSeries[] }>('/search/tv', params)
  return data.results.slice(0, 10)
}

export async function searchMulti(
  query: string
): Promise<{ movies: TMDBMovie[]; series: TMDBSeries[] }> {
  const data = await tmdbFetch<{
    results: ((TMDBMovie | TMDBSeries) & { media_type: string })[]
  }>('/search/multi', { query })

  const movies = data.results
    .filter((r) => r.media_type === 'movie')
    .slice(0, 5) as TMDBMovie[]

  const series = data.results
    .filter((r) => r.media_type === 'tv')
    .slice(0, 5) as TMDBSeries[]

  return { movies, series }
}

/**
 * Searches TMDB using /search/multi and returns up to 10 results preserving
 * TMDB's own relevance ordering. Movies and TV series are interleaved as
 * ranked by TMDB — neither type is deprioritised.
 *
 * Use this for any "search all" UI (e.g. Add Entry, Progress TMDB Repair).
 */
export async function searchMultiNormalized(
  query: string
): Promise<NormalizedTMDBResult[]> {
  const data = await tmdbFetch<{
    results: ((TMDBMovie | TMDBSeries) & { media_type: string })[]
  }>('/search/multi', { query })

  const relevant = data.results
    .filter((r) => r.media_type === 'movie' || r.media_type === 'tv')
    .slice(0, 10)

  const normalized = await Promise.all(
    relevant.map((r) =>
      r.media_type === 'movie'
        ? normalizeMovieResult(r as TMDBMovie)
        : normalizeSeriesResult(r as TMDBSeries)
    )
  )
  return normalized
}

export async function getMovieDetails(tmdbId: number): Promise<TMDBMovie> {
  return tmdbFetch<TMDBMovie>(`/movie/${tmdbId}`, {
    append_to_response: 'release_dates',
  })
}

export async function getTVDetails(tmdbId: number): Promise<TMDBSeries> {
  return tmdbFetch<TMDBSeries>(`/tv/${tmdbId}`, {
    append_to_response: 'content_ratings',
  })
}

async function getMovieCertification(tmdbId: number): Promise<string | null> {
  try {
    const data = await tmdbFetch<{
      results: { iso_3166_1: string; release_dates: { certification: string; type: number }[] }[]
    }>(`/movie/${tmdbId}/release_dates`)

    const usEntry = data.results.find((r) => r.iso_3166_1 === 'US')
    if (usEntry) {
      const theatrical = usEntry.release_dates.find((d) => d.type === 3 && d.certification)
      if (theatrical?.certification) return theatrical.certification
      const any = usEntry.release_dates.find((d) => d.certification)
      if (any?.certification) return any.certification
    }

    const anyEntry = data.results.find((r) =>
      r.release_dates.some((d) => d.certification)
    )
    if (anyEntry) {
      return anyEntry.release_dates.find((d) => d.certification)?.certification || null
    }
  } catch {
    // certification is best-effort
  }
  return null
}

async function getTVCertification(tmdbId: number): Promise<string | null> {
  try {
    const data = await tmdbFetch<{
      results: { iso_3166_1: string; rating: string }[]
    }>(`/tv/${tmdbId}/content_ratings`)

    const usEntry = data.results.find((r) => r.iso_3166_1 === 'US')
    if (usEntry?.rating) return usEntry.rating

    const anyEntry = data.results.find((r) => r.rating)
    return anyEntry?.rating || null
  } catch {
    return null
  }
}

export async function fetchMovieMetadata(tmdbId: number): Promise<NormalizedTMDBResult> {
  const [movie, ageRating] = await Promise.all([
    getMovieDetails(tmdbId),
    getMovieCertification(tmdbId),
  ])

  return {
    tmdbId: movie.id,
    title: movie.title,
    type: 'movie',
    year: movie.release_date ? parseInt(movie.release_date.split('-')[0]) : null,
    releaseDate: movie.release_date || null,
    posterUrl: getTMDBImageUrl(movie.poster_path),
    backdropUrl: getTMDBImageUrl(movie.backdrop_path, 'w1280'),
    genres: movie.genres?.map((g) => g.name) || [],
    country: movie.production_countries?.[0]?.name || null,
    runtime: movie.runtime || null,
    totalEpisodes: null,
    ageRating,
    overview: movie.overview,
  }
}

export async function fetchTVMetadata(tmdbId: number): Promise<NormalizedTMDBResult> {
  const [series, ageRating] = await Promise.all([
    getTVDetails(tmdbId),
    getTVCertification(tmdbId),
  ])

  const runtime =
    series.episode_run_time && series.episode_run_time.length > 0
      ? series.episode_run_time[0]
      : null

  return {
    tmdbId: series.id,
    title: series.name,
    type: 'series',
    year: series.first_air_date ? parseInt(series.first_air_date.split('-')[0]) : null,
    releaseDate: series.first_air_date || null,
    posterUrl: getTMDBImageUrl(series.poster_path),
    backdropUrl: getTMDBImageUrl(series.backdrop_path, 'w1280'),
    genres: series.genres?.map((g) => g.name) || [],
    // origin_country returns ISO codes (e.g. "TH") — normalise to full name
    country: normalizeCountry(series.origin_country?.[0] ?? null),
    runtime,
    totalEpisodes: series.number_of_episodes || null,
    ageRating,
    overview: series.overview,
  }
}

// ---------------------------------------------------------------------------
// Season-level TMDB API
// ---------------------------------------------------------------------------

export async function getSeasonDetails(
  seriesId: number,
  seasonNumber: number
): Promise<TMDBSeasonDetails> {
  return tmdbFetch<TMDBSeasonDetails>(`/tv/${seriesId}/season/${seasonNumber}`)
}

/**
 * Fetch season-specific metadata (episode count, avg runtime, air year, poster).
 * Throws if the TMDB request fails — callers should catch and treat as non-fatal.
 */
export async function fetchSeasonMetadata(
  seriesId: number,
  seasonNumber: number
): Promise<SeasonMetadata> {
  const season = await getSeasonDetails(seriesId, seasonNumber)

  const runtimes = season.episodes
    .map((e) => e.runtime)
    .filter((r): r is number => r != null && r > 0)

  const avgRuntime =
    runtimes.length > 0
      ? Math.round(runtimes.reduce((sum, r) => sum + r, 0) / runtimes.length)
      : null

  return {
    seriesId,
    seasonNumber,
    title: season.name,
    year: season.air_date ? parseInt(season.air_date.split('-')[0]) : null,
    episodeCount: season.episodes.length,
    avgRuntime,
    posterUrl: getTMDBImageUrl(season.poster_path),
  }
}

// ---------------------------------------------------------------------------
// Episode availability — used by the notification center
// ---------------------------------------------------------------------------

export interface TVAvailabilityInfo {
  tmdbId: number
  /** Total episodes listed by TMDB for the checked season/series. */
  totalEpisodes: number
  /** Episodes whose air_date exists and is today or earlier. Future/undated episodes are excluded. */
  airedEpisodes: number
  /** True only when every listed episode has an air_date and has already aired. */
  isFullyAired: boolean
}

function todayIsoLocal(): string {
  const now = new Date()
  const year = now.getFullYear()
  const month = String(now.getMonth() + 1).padStart(2, '0')
  const day = String(now.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

function countAiredEpisodes(episodes: TMDBSeasonDetails['episodes'], today = todayIsoLocal()): number {
  return episodes.filter((episode) => episode.air_date != null && episode.air_date <= today).length
}

export async function fetchTVAvailabilityInfo(
  tmdbId: number,
  seasonNumber?: number | null
): Promise<TVAvailabilityInfo> {
  const today = todayIsoLocal()
  const series = await getTVDetails(tmdbId)

  if (seasonNumber != null) {
    const season = await getSeasonDetails(tmdbId, seasonNumber)
    const totalEpisodes = season.episodes.length
    const airedEpisodes = countAiredEpisodes(season.episodes, today)
    return {
      tmdbId: series.id,
      totalEpisodes,
      airedEpisodes,
      isFullyAired: totalEpisodes > 0 && airedEpisodes === totalEpisodes,
    }
  }

  const seasonNumbers = (series.seasons ?? [])
    .map((season) => season.season_number)
    .filter((n) => n > 0)

  const seasonDetails = await Promise.allSettled(
    seasonNumbers.map((n) => getSeasonDetails(tmdbId, n))
  )

  let totalEpisodes = 0
  let airedEpisodes = 0

  for (const result of seasonDetails) {
    if (result.status !== 'fulfilled') continue
    totalEpisodes += result.value.episodes.length
    airedEpisodes += countAiredEpisodes(result.value.episodes, today)
  }

  return {
    tmdbId: series.id,
    totalEpisodes,
    airedEpisodes,
    isFullyAired: totalEpisodes > 0 && airedEpisodes === totalEpisodes,
  }
}

// ---------------------------------------------------------------------------
// Normalised search results
// ---------------------------------------------------------------------------

export async function normalizeMovieResult(movie: TMDBMovie): Promise<NormalizedTMDBResult> {
  return {
    tmdbId: movie.id,
    title: movie.title,
    type: 'movie',
    year: movie.release_date ? parseInt(movie.release_date.split('-')[0]) : null,
    releaseDate: movie.release_date || null,
    posterUrl: getTMDBImageUrl(movie.poster_path),
    backdropUrl: getTMDBImageUrl(movie.backdrop_path, 'w1280'),
    genres: [],
    country: null,
    runtime: null,
    totalEpisodes: null,
    ageRating: null,
    overview: movie.overview,
  }
}

export async function normalizeSeriesResult(series: TMDBSeries): Promise<NormalizedTMDBResult> {
  return {
    tmdbId: series.id,
    title: series.name,
    type: 'series',
    year: series.first_air_date ? parseInt(series.first_air_date.split('-')[0]) : null,
    releaseDate: series.first_air_date || null,
    posterUrl: getTMDBImageUrl(series.poster_path),
    backdropUrl: getTMDBImageUrl(series.backdrop_path, 'w1280'),
    genres: [],
    country: normalizeCountry(series.origin_country?.[0] ?? null),
    runtime: null,
    totalEpisodes: null,
    ageRating: null,
    overview: series.overview,
  }
}
