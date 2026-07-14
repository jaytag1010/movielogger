'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { MediaEntry } from '@/types/media'
import { fetchMovieMetadata, fetchTVAvailabilityInfo } from '@/lib/tmdb/api'
import { getEffectiveMediaType } from '@/utils/formatters'

export interface ProgressReleaseStatus {
  label: string
  tone: 'muted' | 'released' | 'upcoming' | 'airing'
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
      return { label: '🎬 Release date unavailable', tone: 'muted' }
    }

    if (releaseDate > today) {
      return { label: `🎬 Releases on ${formatIsoDate(releaseDate)}`, tone: 'upcoming' }
    }

    return { label: '✅ Movie Released', tone: 'released' }
  }

  if (entry.tmdbId == null) {
    return { label: '📺 Episode release information unavailable', tone: 'muted' }
  }

  try {
    const info = await fetchTVAvailabilityInfo(entry.tmdbId, entry.seasonNumber)

    if (info.totalEpisodes <= 0) {
      return { label: '📺 Episode release information unavailable', tone: 'muted' }
    }

    if (info.airedEpisodes === 0) {
      if (info.firstEpisodeAirDate) {
        return {
          label: `📺 Season premieres on ${formatIsoDate(info.firstEpisodeAirDate)}`,
          tone: 'upcoming',
        }
      }

      return { label: '📺 Episode release information unavailable', tone: 'muted' }
    }

    if (info.isFullyAired) {
      return { label: '✅ All Episodes Released', tone: 'released' }
    }

    return {
      label: formatEpisodeReleasedLabel(info.airedEpisodes, info.totalEpisodes),
      tone: 'airing',
    }
  } catch {
    return { label: '📺 Episode release information unavailable', tone: 'muted' }
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
  }, [trackedKey, trackedEntries])

  return statuses
}
