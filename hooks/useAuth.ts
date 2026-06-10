'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { useAuthStore } from '@/store/authStore'
import { onAuthChange } from '@/lib/firebase/auth'
import {
  signUpWithEmail,
  signInWithEmail,
  signInWithGoogle,
  logOut,
  resetPassword,
} from '@/lib/firebase/auth'
import { getUserProfile } from '@/lib/firebase/firestore'

export function useAuth() {
  const { user, loading, initialized } = useAuthStore()

  return { user, loading, initialized }
}

export function useAuthActions() {
  return {
    signUpWithEmail,
    signInWithEmail,
    signInWithGoogle,
    logOut,
    resetPassword,
  }
}

export function useAuthInit() {
  const { setUser, setLoading, setInitialized, setProfileDisplayName } = useAuthStore()

  useEffect(() => {
    const unsubscribe = onAuthChange((user) => {
      setUser(user)
      setLoading(false)
      setInitialized(true)
      // Load the app Display Name immediately on auth so every page has it
      // before its first render — eliminates the Google-name flash on Dashboard.
      if (user) {
        getUserProfile(user.uid)
          .then((p) => setProfileDisplayName(p.displayName))
          .catch(() => setProfileDisplayName(null))
      } else {
        setProfileDisplayName(null)
      }
    })
    return unsubscribe
  }, [setUser, setLoading, setInitialized, setProfileDisplayName])
}

export function useRequireAuth() {
  const { user, initialized } = useAuthStore()
  const router = useRouter()

  useEffect(() => {
    if (initialized && !user) {
      router.push('/login')
    }
  }, [user, initialized, router])

  return { user, initialized }
}
