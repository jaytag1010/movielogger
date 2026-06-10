import { create } from 'zustand'
import { User } from 'firebase/auth'

interface AuthState {
  user: User | null
  loading: boolean
  initialized: boolean
  /** App-level Display Name from Firestore profile — loaded once at auth-init. */
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
  profileDisplayName: null,
  setUser: (user) => set({ user }),
  setLoading: (loading) => set({ loading }),
  setInitialized: (initialized) => set({ initialized }),
  setProfileDisplayName: (profileDisplayName) => set({ profileDisplayName }),
}))
