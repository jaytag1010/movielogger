import { create } from 'zustand'
import { User } from 'firebase/auth'

// ── localStorage cache helpers ─────────────────────────────────────────────
// The display name is cached in localStorage so it is available synchronously
// on the very first render — eliminating the Google-name flash on Dashboard.
const LS_KEY = 'ml_displayname'

function readCachedDisplayName(): string | null {
  if (typeof window === 'undefined') return null
  try { return localStorage.getItem(LS_KEY) || null } catch { return null }
}

export function writeCachedDisplayName(name: string | null): void {
  if (typeof window === 'undefined') return
  try {
    if (name) localStorage.setItem(LS_KEY, name)
    else localStorage.removeItem(LS_KEY)
  } catch { /* storage unavailable */ }
}

// ── Store ──────────────────────────────────────────────────────────────────

interface AuthState {
  user: User | null
  loading: boolean
  initialized: boolean
  /** App-level Display Name from Firestore profile. Pre-seeded from localStorage. */
  profileDisplayName: string | null
  setUser: (user: User | null) => void
  setLoading: (loading: boolean) => void
  setInitialized: (initialized: boolean) => void
  setProfileDisplayName: (name: string | null) => void
}

export const useAuthStore = create<AuthState>((set) => ({
  user: null,
  loading: true,
  initialized: false,
  // Synchronous read from localStorage — correct on first render, no flash.
  profileDisplayName: readCachedDisplayName(),
  setUser: (user) => set({ user }),
  setLoading: (loading) => set({ loading }),
  setInitialized: (initialized) => set({ initialized }),
  setProfileDisplayName: (profileDisplayName) => {
    writeCachedDisplayName(profileDisplayName)
    set({ profileDisplayName })
  },
}))
