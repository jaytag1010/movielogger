'use client'

export const dynamic = 'force-dynamic'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { motion } from 'framer-motion'
import { useAuthStore } from '@/store/authStore'
import { PageLoader } from '@/components/common/LoadingSpinner'

export default function RootPage() {
  const router = useRouter()
  const { user, initialized } = useAuthStore()

  useEffect(() => {
    if (!initialized) return
    if (user) {
      router.replace('/dashboard')
    } else {
      router.replace('/login')
    }
  }, [user, initialized, router])

  return <PageLoader />
}
