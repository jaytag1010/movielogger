import { create } from 'zustand'
import { Timestamp } from 'firebase/firestore'
import { MediaEntry, MediaFilters, DEFAULT_FILTERS } from '@/types/media'

interface MediaState {
  entries: MediaEntry[]
  loading: boolean
  filters: MediaFilters
  activeTab: 'all' | 'movie' | 'series'
  setEntries: (entries: MediaEntry[]) => void
  addEntry: (entry: MediaEntry) => void
  updateEntry: (id: string, updates: Partial<MediaEntry>) => void
  removeEntry: (id: string) => void
  setLoading: (loading: boolean) => void
  setFilters: (filters: Partial<MediaFilters>) => void
  resetFilters: () => void
  setActiveTab: (tab: 'all' | 'movie' | 'series') => void
}

export const useMediaStore = create<MediaState>((set) => ({
  entries: [],
  loading: false,
  filters: DEFAULT_FILTERS,
  activeTab: 'all',

  setEntries: (entries) => set({ entries }),

  addEntry: (entry) =>
    set((state) => ({ entries: [entry, ...state.entries] })),

  updateEntry: (id, updates) =>
    set((state) => {
      // Move the updated entry to the front so the Progress tab surfaces the
      // most-recently-touched title at the top. Other views sort independently.
      const updated = state.entries.find((e) => e.id === id)
      if (!updated) return {}
      // Inject a client-side updatedAt so the progress page's updatedAt-based
      // sort moves the card immediately without waiting for a Firestore round-trip.
      const merged = { ...updated, ...updates, updatedAt: Timestamp.now() }
      return {
        entries: [merged, ...state.entries.filter((e) => e.id !== id)],
      }
    }),

  removeEntry: (id) =>
    set((state) => ({
      entries: state.entries.filter((e) => e.id !== id),
    })),

  setLoading: (loading) => set({ loading }),

  setFilters: (filters) =>
    set((state) => ({ filters: { ...state.filters, ...filters } })),

  resetFilters: () => set({ filters: DEFAULT_FILTERS }),

  setActiveTab: (activeTab) => set({ activeTab }),

}))
