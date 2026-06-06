'use client'

import { useState, useCallback, useRef } from 'react'
import { NormalizedTMDBResult } from '@/types/tmdb'
import { searchAllProviders } from '@/lib/providers/metadata'

/**
 * Debounced hook that searches TMDB and MDL in parallel.
 * Mirrors useTMDBSearch from hooks/useTMDB.ts.
 * Each result carries `source: 'tmdb' | 'mdl'` for display purposes.
 */
export function useUnifiedSearch() {
  const [results, setResults]   = useState<NormalizedTMDBResult[]>([])
  const [loading, setLoading]   = useState(false)
  const [error,   setError]     = useState<string | null>(null)
  const debounceRef             = useRef<ReturnType<typeof setTimeout> | null>(null)

  const search = useCallback(async (query: string) => {
    if (!query.trim() || query.length < 2) {
      setResults([])
      return
    }

    if (debounceRef.current) clearTimeout(debounceRef.current)

    debounceRef.current = setTimeout(async () => {
      setLoading(true)
      setError(null)
      try {
        const items = await searchAllProviders(query)
        setResults(items.slice(0, 15))
      } catch {
        setError('Search failed — please try again')
        setResults([])
      } finally {
        setLoading(false)
      }
    }, 350)
  }, [])

  const clearResults = useCallback(() => {
    setResults([])
    setError(null)
  }, [])

  return { results, loading, error, search, clearResults }
}
