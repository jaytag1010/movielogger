'use client'

import { useEffect, useCallback } from 'react'
import { Timestamp } from 'firebase/firestore'
import { toast } from 'sonner'
import { useMediaStore } from '@/store/mediaStore'
import { useAuthStore } from '@/store/authStore'
import {
  getUserMediaEntries,
  createMediaEntry,
  updateMediaEntry,
  deleteMediaEntry,
} from '@/lib/firebase/firestore'
import { MediaEntry, MediaEntryInput, MediaEntryUpdate, MediaFilters } from '@/types/media'
import { getEffectiveMediaType } from '@/utils/formatters'
import { comparePriorityAscThenUpdatedDesc, comparePriorityDescThenUpdatedDesc } from '@/utils/priority'
import { compareDateAdded } from '@/utils/internalIdSort'
import { normalizeCountry } from '@/utils/countries'
import { calculateStoredWatchHours } from '@/utils/watchHours'
import { compareRankedEntries } from '@/utils/ranking'
import { addActivity, ensureActivityHistoryEnabled } from '@/lib/firebase/activity'
import { fetchMovieMetadata, fetchTVMetadata } from '@/lib/tmdb/api'
import {
  buildTitleAddedActivity,
  buildTitleDeletedActivity,
  buildUpdateActivities,
} from '@/utils/activity'

const overviewMigrationStartedForUsers = new Set<string>()

export function useMedia() {
  const { entries, loading, filters, activeTab } = useMediaStore()
  const { user } = useAuthStore()

  const loadEntries = useCallback(async () => {
    if (!user) return
    useMediaStore.getState().setLoading(true)
    try {
      await ensureActivityHistoryEnabled(user.uid).catch(() => {})
      const data = await getUserMediaEntries(user.uid)
      useMediaStore.getState().setEntries(data)
      migrateMissingOverviews(user.uid, data).catch((err) => {
        console.warn('Failed to backfill TMDB overviews', err)
      })
    } catch (err) {
      toast.error('Failed to load media entries')
    } finally {
      useMediaStore.getState().setLoading(false)
    }
  }, [user])

  useEffect(() => {
    if (user && entries.length === 0) {
      loadEntries()
    }
  }, [user])

  const addEntry = useCallback(
    async (input: Omit<MediaEntryInput, 'userId'>) => {
      if (!user) throw new Error('Not authenticated')
      const entry = await createMediaEntry(user.uid, input)
      useMediaStore.getState().addEntry(entry)
      await addActivity(user.uid, buildTitleAddedActivity(entry)).catch((err) => {
        console.warn('Failed to record title-added activity', err)
      })
      return entry
    },
    [user]
  )

  const editEntry = useCallback(async (id: string, updates: MediaEntryUpdate) => {
    const current = useMediaStore.getState().entries.find((entry) => entry.id === id)
    await updateMediaEntry(id, updates)
    const merged = current ? { ...current, ...updates } : updates
    const normalizedUpdates: Partial<MediaEntry> = { ...(updates as Partial<MediaEntry>) }
    if ('country' in merged) {
      normalizedUpdates.country = normalizeCountry(merged.country)
    }
    if ('totalEpisodes' in merged || 'episodeDurationMinutes' in merged) {
      normalizedUpdates.watchHours = calculateStoredWatchHours(merged)
    }
    if (
      ('nextEpisodeToWatch' in updates && updates.nextEpisodeToWatch !== current?.nextEpisodeToWatch) ||
      (updates.status === 'watching' && current?.status !== 'watching')
    ) {
      normalizedUpdates.watchingActivityAt = Timestamp.now()
    }
    useMediaStore.getState().updateEntry(id, normalizedUpdates)
    if (user && current) {
      const activities = buildUpdateActivities(current, normalizedUpdates as MediaEntryUpdate)
      activities.forEach((activity) => addActivity(user.uid, activity).catch(() => {}))
    }
  }, [user])

  /**
   * Refresh metadata without disturbing the In Progress ordering.
   * Unlike editEntry, this does NOT update `updatedAt` in Firestore and does NOT
   * move the entry to the front of the in-memory list — so the user's established
   * card order is fully preserved after a Refresh All operation.
   */
  const refreshEntry = useCallback(async (id: string, updates: MediaEntryUpdate) => {
    await updateMediaEntry(id, updates, { preserveOrder: true })
    // Update in-place: map over the existing array without reordering
    const current = useMediaStore.getState().entries
    useMediaStore.getState().setEntries(
      current.map((e) => {
        if (e.id !== id) return e
        const merged = { ...e, ...updates }
        return {
          ...merged,
          country: normalizeCountry(merged.country),
          watchHours: calculateStoredWatchHours(merged),
        }
      })
    )
  }, [])

  const removeEntry = useCallback(async (id: string) => {
    const current = useMediaStore.getState().entries.find((entry) => entry.id === id)
    await deleteMediaEntry(id)
    if (user && current) {
      addActivity(user.uid, buildTitleDeletedActivity(current)).catch(() => {})
    }
    await loadEntries()
  }, [loadEntries, user])

  const filteredEntries = getFilteredEntries(entries, filters)

  return {
    entries,
    filteredEntries,
    loading,
    filters,
    activeTab,
    loadEntries,
    addEntry,
    editEntry,
    refreshEntry,
    removeEntry,
  }
}

async function migrateMissingOverviews(userId: string, entries: MediaEntry[]) {
  if (overviewMigrationStartedForUsers.has(userId)) return
  const candidates = entries.filter((entry) => entry.id && entry.tmdbId != null && !entry.overview?.trim())
  if (candidates.length === 0) return

  overviewMigrationStartedForUsers.add(userId)

  for (const entry of candidates) {
    if (!entry.id || entry.tmdbId == null) continue
    try {
      const type = getEffectiveMediaType(entry)
      const metadata = type === 'movie'
        ? await fetchMovieMetadata(entry.tmdbId)
        : await fetchTVMetadata(entry.tmdbId)
      const overview = metadata.overview?.trim() || null
      if (!overview) continue

      await updateMediaEntry(entry.id, { overview }, { preserveOrder: true })
      const current = useMediaStore.getState().entries
      useMediaStore.getState().setEntries(
        current.map((item) => item.id === entry.id ? { ...item, overview } : item)
      )
    } catch {
      // Skip individual failures; unmatched or stale TMDB IDs remain usable.
    }
  }
}

function getFilteredEntries(entries: MediaEntry[], filters: MediaFilters): MediaEntry[] {
  let result = [...entries]

  if (filters.type !== 'all') {
    result = result.filter((e) => getEffectiveMediaType(e) === filters.type)
  }

  if (filters.status !== 'all') {
    result = result.filter((e) => e.status === filters.status)
  }

  if (filters.genre !== 'all') {
    result = result.filter((e) => e.genres?.includes(filters.genre))
  }

  if (filters.country !== 'all') {
    result = result.filter((e) => e.country === filters.country)
  }

  if (filters.year !== 'all') {
    const yr = parseInt(filters.year, 10)
    result = result.filter((e) => e.yearMade === yr)
  }

  if (filters.ageRating !== 'all') {
    result = result.filter((e) => e.ageRating === filters.ageRating)
  }

  if (filters.search) {
    const search = filters.search.toLowerCase()
    result = result.filter(
      (e) =>
        e.title.toLowerCase().includes(search) ||
        (e.nativeTitle?.toLowerCase().includes(search) ?? false) ||
        e.genres?.some((g) => g.toLowerCase().includes(search)) ||
        e.country?.toLowerCase().includes(search) ||
        e.internalId.toLowerCase().includes(search)
    )
  }

  // When sorting by rating, only show completed entries (non-completed lack a
  // meaningful personal rating context and dilute the ranking view).
  if (filters.sortBy === 'rating') {
    result = result.filter((e) => e.status === 'completed')
  }

  if (filters.sortBy === 'priority') {
    result = result.filter((e) => e.status === 'planned' || e.status === 'on_hold')
  }

  result.sort((a, b) => {
    const order = filters.sortOrder === 'asc' ? 1 : -1
    switch (filters.sortBy) {
      case 'title':
        return order * a.title.localeCompare(b.title)
      case 'rating':
        if (filters.sortOrder === 'desc') return compareRankedEntries(a, b)
        return (a.personalRating ?? 0) - (b.personalRating ?? 0) || compareRankedEntries(a, b)
      case 'year':
        return order * ((a.yearMade ?? 0) - (b.yearMade ?? 0))
      case 'priority':
        return filters.sortOrder === 'asc'
          ? comparePriorityAscThenUpdatedDesc(a, b)
          : comparePriorityDescThenUpdatedDesc(a, b)
      case 'dateFinished': {
        // Priority: (1) dateFinished timestamp, (2) TMDB full release date,
        // (3) yearMade as approximate fallback.
        const toSortKey = (e: MediaEntry): number => {
          if (e.dateFinished) return e.dateFinished.toMillis()
          if (e.tmdbReleaseDate) return new Date(e.tmdbReleaseDate).getTime()
          if (e.yearMade) return new Date(`${e.yearMade}-01-01`).getTime()
          return 0
        }
        return order * (toSortKey(a) - toSortKey(b))
      }
      case 'createdAt': {
        return order * compareDateAdded(a, b)
      }
      default:
        return 0
    }
  })

  return result
}
