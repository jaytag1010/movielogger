'use client'

export const dynamic = 'force-dynamic'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { useAuthStore } from '@/store/authStore'
import { PageLoader } from '@/components/common/LoadingSpinner'

export default function ProtectedLayout({ children }: { children: React.ReactNode }) {
  const { user, initialized } = useAuthStore()
  const router = useRouter()

  useEffect(() => {
    if (initialized && !user) {
      router.replace('/login')
    }
  }, [user, initialized, router])

  if (!initialized) return <PageLoader />
  if (!user) return <PageLoader />

  return <>{children}</>
}
