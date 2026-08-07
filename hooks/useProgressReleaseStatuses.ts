'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { MediaEntry } from '@/types/media'
import { fetchMovieMetadata, fetchTVAvailabilityInfo } from '@/lib/tmdb/api'
import { getEffectiveMediaType } from '@/utils/formatters'

export interface ProgressReleaseStatus {
  label: string
  tone: 'muted' | 'released' | 'upcoming' | 'airing'
  /** Sort rank: 3=released, 2=airing, 1=not yet released, 0=unknown. */
  releaseRank: number
  releasedEpisodes: number | null
  expectedEpisodes: number | null
  episodesWaiting: number | null
}

function makeStatus(
  label: string,
  tone: ProgressReleaseStatus['tone'],
  releaseRank: number,
  releasedEpisodes: number | null = null,
  expectedEpisodes: number | null = null,
  episodesWaiting: number | null = null
): ProgressReleaseStatus {
  return { label, tone, releaseRank, releasedEpisodes, expectedEpisodes, episodesWaiting }
}

function todayIsoLocal(): string {
  const now = new Date()
  const year = now.getFullYear()
  const month = String(now.getMonth() + 1).padStart(2, '0')
  const day = String(now.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

function formatIsoDate(isoDate: string): string {
  return new Date(`${isoDate}T00:00:00`).toLocaleDateString('en-US', {
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  })
}

function formatEpisodeReleasedLabel(airedEpisodes: number, totalEpisodes: number): string {
  const noun = airedEpisodes === 1 ? 'Episode' : 'Episodes'
  return `📺 ${airedEpisodes}/${totalEpisodes} ${noun} Released`
}

function cacheKey(entry: MediaEntry): string {
  return [
    entry.id,
    entry.status,
    entry.tmdbId ?? 'none',
    getEffectiveMediaType(entry),
    entry.seasonNumber ?? 'all',
    entry.totalEpisodes ?? 'unknown-total',
    entry.nextEpisodeToWatch ?? 'unknown-progress',
    entry.tmdbReleaseDate ?? 'no-date',
  ].join(':')
}

async function buildReleaseStatus(entry: MediaEntry): Promise<ProgressReleaseStatus | null> {
  if (entry.status === 'completed') return null

  const effectiveType = getEffectiveMediaType(entry)
  const today = todayIsoLocal()

  if (effectiveType === 'movie') {
    let releaseDate = entry.tmdbReleaseDate

    if (!releaseDate && entry.tmdbId != null) {
      try {
        const metadata = await fetchMovieMetadata(entry.tmdbId)
        releaseDate = metadata.releaseDate
      } catch {
        releaseDate = null
      }
    }

    if (!releaseDate) {
      return makeStatus('🎬 Release date unavailable', 'muted', 0)
    }

    if (releaseDate > today) {
      return makeStatus(`🎬 Releases on ${formatIsoDate(releaseDate)}`, 'upcoming', 1, 0, 1)
    }

    return makeStatus('✅ Movie Released', 'released', 3, 1, 1)
  }

  if (entry.tmdbId == null) {
    return makeStatus('Episode release information unavailable', 'muted', 0)
  }

  try {
    const info = await fetchTVAvailabilityInfo(entry.tmdbId, entry.seasonNumber)
    const expectedEpisodes = entry.totalEpisodes ?? info.totalEpisodes

    if (info.totalEpisodes <= 0 || expectedEpisodes <= 0) {
      return makeStatus('Episode release information unavailable', 'muted', 0)
    }

    if (info.airedEpisodes === 0) {
      if (info.firstEpisodeAirDate) {
        return makeStatus(
          `📺 Season premieres on ${formatIsoDate(info.firstEpisodeAirDate)}`,
          'upcoming',
          1,
          0,
          expectedEpisodes
        )
      }

      return makeStatus('Episode release information unavailable', 'muted', 0)
    }

    const releasedEpisodes = Math.min(info.airedEpisodes, expectedEpisodes)
    const episodesWaiting = Math.max(0, releasedEpisodes - (entry.nextEpisodeToWatch ?? 0))

    if (releasedEpisodes >= expectedEpisodes) {
      return makeStatus(
        '✅ All Episodes Released',
        'released',
        3,
        releasedEpisodes,
        expectedEpisodes,
        episodesWaiting
      )
    }

    return makeStatus(
      formatEpisodeReleasedLabel(releasedEpisodes, expectedEpisodes),
      'airing',
      2,
      releasedEpisodes,
      expectedEpisodes,
      episodesWaiting
    )
  } catch {
    return makeStatus('Episode release information unavailable', 'muted', 0)
  }
}

export function useProgressReleaseStatuses(entries: MediaEntry[]): Record<string, ProgressReleaseStatus> {
  const [statuses, setStatuses] = useState<Record<string, ProgressReleaseStatus>>({})
  const cacheRef = useRef<Map<string, ProgressReleaseStatus | null>>(new Map())

  const trackedEntries = useMemo(
    () => entries.filter((entry) => entry.id && entry.status !== 'completed'),
    [entries]
  )

  const trackedKey = useMemo(
    () => trackedEntries.map(cacheKey).join('|'),
    [trackedEntries]
  )

  useEffect(() => {
    let cancelled = false

    async function loadStatuses() {
      if (trackedEntries.length === 0) {
        setStatuses((current) => Object.keys(current).length === 0 ? current : {})
        return
      }

      const updates: Record<string, ProgressReleaseStatus> = {}

      await Promise.all(
        trackedEntries.map(async (entry) => {
          if (!entry.id) return
          const key = cacheKey(entry)
          const cached = cacheRef.current.get(key)
          const status = cached !== undefined ? cached : await buildReleaseStatus(entry)
          if (cached === undefined) cacheRef.current.set(key, status)
          if (status) updates[entry.id] = status
        })
      )

      if (!cancelled) {
        setStatuses(updates)
      }
    }

    loadStatuses()

    return () => {
      cancelled = true
    }
  }, [trackedKey])

  return statuses
}
