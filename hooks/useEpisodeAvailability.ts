'use client'

import { useState, useCallback, useRef } from 'react'
import { MediaEntry } from '@/types/media'
import { fetchTVAvailabilityInfo } from '@/lib/tmdb/api'

export interface NewEpisodeInfo {
  entry: MediaEntry
  /** Current TMDB episode count for this series */
  tmdbEpisodeCount: number
  /** How many episodes TMDB has beyond the entry's stored count */
  delta: number
}

export interface EpisodeAvailabilityResult {
  loading: boolean
  newEpisodes: NewEpisodeInfo[]
  readyToBinge: MediaEntry[]
  fetchAvailability: () => Promise<void>
}

// Avoid hammering TMDB on large libraries
const MAX_CANDIDATES = 30

interface CachedInfo {
  totalEpisodes: number
  isEnded: boolean
}

export function useEpisodeAvailability(entries: MediaEntry[]): EpisodeAvailabilityResult {
  const [loading, setLoading] = useState(false)
  const [newEpisodes, setNewEpisodes] = useState<NewEpisodeInfo[]>([])
  const [readyToBinge, setReadyToBinge] = useState<MediaEntry[]>([])
  // Session-level cache so re-opening the dialog avoids redundant TMDB calls
  const cacheRef = useRef<Map<number, CachedInfo>>(new Map())
  const fetchedRef = useRef(false)

  const fetchAvailability = useCallback(async () => {
    // Skip if already fetched this session
    if (fetchedRef.current) return
    fetchedRef.current = true

    // Candidates for "new episodes available" — watching series with a TMDB ID
    const watchingCandidates = entries
      .filter((e) => e.type === 'series' && e.tmdbId != null && e.status === 'watching')
      .slice(0, MAX_CANDIDATES)

    // Candidates for "ready to binge" — planned/on_hold series with a TMDB ID
    const bingeCandidates = entries
      .filter(
        (e) =>
          e.type === 'series' &&
          e.tmdbId != null &&
          (e.status === 'planned' || e.status === 'on_hold')
      )
      .slice(0, MAX_CANDIDATES)

    // Unique TMDB IDs not yet in the cache
    const allIdSet = new Set([
      ...watchingCandidates.map((e) => e.tmdbId!),
      ...bingeCandidates.map((e) => e.tmdbId!),
    ])
    const allIds = Array.from(allIdSet).filter((id) => !cacheRef.current.has(id))

    if (allIds.length === 0 && watchingCandidates.length === 0 && bingeCandidates.length === 0) {
      return
    }

    setLoading(true)
    try {
      const results = await Promise.allSettled(allIds.map((id) => fetchTVAvailabilityInfo(id)))
      for (const r of results) {
        if (r.status === 'fulfilled') {
          cacheRef.current.set(r.value.tmdbId, {
            totalEpisodes: r.value.totalEpisodes,
            isEnded: r.value.isEnded,
          })
        }
      }

      // New episodes: TMDB has more episodes than the entry's stored totalEpisodes
      const newEps: NewEpisodeInfo[] = []
      for (const entry of watchingCandidates) {
        const info = cacheRef.current.get(entry.tmdbId!)
        if (!info) continue
        const storedEps = entry.totalEpisodes ?? 0
        if (info.totalEpisodes > storedEps) {
          newEps.push({
            entry,
            tmdbEpisodeCount: info.totalEpisodes,
            delta: info.totalEpisodes - storedEps,
          })
        }
      }

      // Ready to binge: all episodes are out (series ended / no future air dates)
      const binge: MediaEntry[] = []
      for (const entry of bingeCandidates) {
        const info = cacheRef.current.get(entry.tmdbId!)
        if (info?.isEnded) {
          binge.push(entry)
        }
      }

      setNewEpisodes(newEps)
      setReadyToBinge(binge)
    } finally {
      setLoading(false)
    }
  }, [entries])

  return { loading, newEpisodes, readyToBinge, fetchAvailability }
}
