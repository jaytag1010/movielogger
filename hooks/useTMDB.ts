'use client'

import { useState, useCallback, useRef } from 'react'
import {
  searchMovies,
  searchTVSeries,
  searchMultiNormalized,
  fetchMovieMetadata,
  fetchTVMetadata,
  fetchSeasonMetadata,
  normalizeMovieResult,
  normalizeSeriesResult,
} from '@/lib/tmdb/api'
import { NormalizedTMDBResult, SeasonMetadata } from '@/types/tmdb'
import { MediaType } from '@/types/media'
import { parseSearchQuery } from '@/utils/searchParser'
import { normalizeCountry } from '@/utils/countries'

export function useTMDBSearch(mediaType: MediaType | 'all' = 'all') {
  const [results, setResults] = useState<NormalizedTMDBResult[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const search = useCallback(
    async (rawQuery: string) => {
      if (!rawQuery.trim() || rawQuery.length < 2) {
        setResults([])
        return
      }

      if (debounceRef.current) clearTimeout(debounceRef.current)

      debounceRef.current = setTimeout(async () => {
        setLoading(true)
        setError(null)
        try {
          // ── TMDB ID direct lookup ─────────────────────────────────────────
          // If the entire query is a positive integer, treat it as a TMDB ID.
          // Movie IDs and TV IDs occupy separate TMDB namespaces and may share
          // the same numeric value — always check BOTH and return all matches.
          const trimmed = rawQuery.trim()
          if (/^\d+$/.test(trimmed)) {
            const id = parseInt(trimmed, 10)
            const [movieResult, tvResult] = await Promise.allSettled([
              fetchMovieMetadata(id),
              fetchTVMetadata(id),
            ])
            const found: NormalizedTMDBResult[] = []
            if (movieResult.status === 'fulfilled') found.push(movieResult.value)
            if (tvResult.status   === 'fulfilled') found.push(tvResult.value)

            if (found.length > 0) {
              setResults(found)
            } else {
              setError(`No TMDB title found for ID ${id}`)
              setResults([])
            }
            return
          }

          // ── Advanced text search with optional country/year filters ────────
          // Parse the raw query for advanced filters (country, year)
          const { title, country, year } = parseSearchQuery(rawQuery)
          // If the parser stripped the title entirely (e.g. query was just a year),
          // fall back to the original raw query so nothing breaks.
          const titleQuery = title.trim().length >= 2 ? title : rawQuery.trim()

          const items: NormalizedTMDBResult[] = []

          if (mediaType === 'all') {
            if (country || year) {
              // Switch to per-type endpoints so we can pass the year param to TMDB.
              // /search/multi doesn't support year filtering.
              const [movies, series] = await Promise.all([
                searchMovies(titleQuery, year ?? undefined),
                searchTVSeries(titleQuery, year ?? undefined),
              ])
              const movieResults = await Promise.all(movies.map(normalizeMovieResult))
              const tvResults    = await Promise.all(series.map(normalizeSeriesResult))
              items.push(...movieResults, ...tvResults)
            } else {
              // Use /search/multi so TMDB's relevance ranking is preserved across
              // both types. The old approach (movie first, then series) hid TV
              // results entirely when ≥10 movie results existed.
              const results = await searchMultiNormalized(titleQuery)
              items.push(...results)
            }
          } else {
            if (mediaType === 'movie') {
              const movies = await searchMovies(titleQuery, year ?? undefined)
              const normalized = await Promise.all(movies.map(normalizeMovieResult))
              items.push(...normalized)
            }
            if (mediaType === 'series') {
              const series = await searchTVSeries(titleQuery, year ?? undefined)
              const normalized = await Promise.all(series.map(normalizeSeriesResult))
              items.push(...normalized)
            }
          }

          let filtered = items

          // ── Country filter ─────────────────────────────────────────────────
          // TV series carry origin_country from TMDB search results.
          // Movies generally don't — they pass through the country filter
          // unchanged (not excluded) since we can't confirm or deny their origin.
          if (country) {
            filtered = filtered.filter((r) => {
              if (!r.country) return false          // no data → exclude
              return normalizeCountry(r.country) === country
            })
          }

          // ── Year filter (client-side belt-and-suspenders) ──────────────────
          // The API already applied year filtering, but TMDB sometimes returns
          // adjacent years. This ensures strict year matching.
          if (year) {
            filtered = filtered.filter((r) => r.year === year)
          }

          setResults(filtered.slice(0, 10))
        } catch (err) {
          setError('Failed to search TMDB')
          setResults([])
        } finally {
          setLoading(false)
        }
      }, 350)
    },
    [mediaType]
  )

  const clearResults = useCallback(() => {
    setResults([])
    setError(null)
  }, [])

  return { results, loading, error, search, clearResults }
}

export function useTMDBDetails() {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const fetchDetails = useCallback(
    async (tmdbId: number, type: MediaType): Promise<NormalizedTMDBResult | null> => {
      setLoading(true)
      setError(null)
      try {
        const result =
          type === 'movie'
            ? await fetchMovieMetadata(tmdbId)
            : await fetchTVMetadata(tmdbId)
        return result
      } catch (err) {
        setError('Failed to fetch details from TMDB')
        return null
      } finally {
        setLoading(false)
      }
    },
    []
  )

  return { fetchDetails, loading, error }
}

export function useTMDBSeasonDetails() {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const fetchSeason = useCallback(
    async (seriesId: number, seasonNumber: number): Promise<SeasonMetadata | null> => {
      setLoading(true)
      setError(null)
      try {
        const result = await fetchSeasonMetadata(seriesId, seasonNumber)
        return result
      } catch {
        setError('Failed to fetch season details from TMDB')
        return null
      } finally {
        setLoading(false)
      }
    },
    []
  )

  return { fetchSeason, loading, error }
}
