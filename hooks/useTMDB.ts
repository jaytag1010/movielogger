'use client'

import { useState, useCallback, useRef } from 'react'
import {
  searchMovies,
  searchTVSeries,
  fetchMovieMetadata,
  fetchTVMetadata,
  fetchSeasonMetadata,
  normalizeMovieResult,
  normalizeSeriesResult,
} from '@/lib/tmdb/api'
import { NormalizedTMDBResult, SeasonMetadata } from '@/types/tmdb'
import { MediaType } from '@/types/media'

export function useTMDBSearch(mediaType: MediaType | 'all' = 'all') {
  const [results, setResults] = useState<NormalizedTMDBResult[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const search = useCallback(
    async (query: string, year?: number) => {
      if (!query.trim() || query.length < 2) {
        setResults([])
        return
      }

      if (debounceRef.current) clearTimeout(debounceRef.current)

      debounceRef.current = setTimeout(async () => {
        setLoading(true)
        setError(null)
        try {
          const items: NormalizedTMDBResult[] = []

          if (mediaType === 'movie' || mediaType === 'all') {
            const movies = await searchMovies(query, year)
            const normalized = await Promise.all(movies.map(normalizeMovieResult))
            items.push(...normalized)
          }

          if (mediaType === 'series' || mediaType === 'all') {
            const series = await searchTVSeries(query, year)
            const normalized = await Promise.all(series.map(normalizeSeriesResult))
            items.push(...normalized)
          }

          setResults(items.slice(0, 10))
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
