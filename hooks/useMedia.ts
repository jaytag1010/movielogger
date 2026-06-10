'use client'

import { useEffect, useCallback } from 'react'
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
import { Timestamp } from 'firebase/firestore'

export function useMedia() {
  const { entries, loading, filters, activeTab } = useMediaStore()
  const { user } = useAuthStore()

  const loadEntries = useCallback(async () => {
    if (!user) return
    useMediaStore.getState().setLoading(true)
    try {
      const data = await getUserMediaEntries(user.uid)
      useMediaStore.getState().setEntries(data)
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
      return entry
    },
    [user]
  )

  const editEntry = useCallback(async (id: string, updates: MediaEntryUpdate) => {
    await updateMediaEntry(id, updates)
    useMediaStore.getState().updateEntry(id, updates as Partial<MediaEntry>)
  }, [])

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
      current.map((e) => e.id === id ? { ...e, ...updates } : e)
    )
  }, [])

  const removeEntry = useCallback(async (id: string) => {
    await deleteMediaEntry(id)
    useMediaStore.getState().removeEntry(id)
  }, [])

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

  result.sort((a, b) => {
    const order = filters.sortOrder === 'asc' ? 1 : -1
    switch (filters.sortBy) {
      case 'title':
        return order * a.title.localeCompare(b.title)
      case 'rating':
        return order * ((a.personalRating ?? 0) - (b.personalRating ?? 0))
      case 'year':
        return order * ((a.yearMade ?? 0) - (b.yearMade ?? 0))
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
        const aDate = a.createdAt?.toMillis() ?? 0
        const bDate = b.createdAt?.toMillis() ?? 0
        return order * (aDate - bDate)
      }
      default:
        return 0
    }
  })

  return result
}
