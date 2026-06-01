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
  const { setUser, setLoading, setInitialized } = useAuthStore()

  useEffect(() => {
    const unsubscribe = onAuthChange((user) => {
      setUser(user)
      setLoading(false)
      setInitialized(true)
    })
    return unsubscribe
  }, [setUser, setLoading, setInitialized])
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
