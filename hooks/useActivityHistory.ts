'use client'

import { useCallback, useEffect, useState } from 'react'
import { toast } from 'sonner'
import { ActivityEntry } from '@/types/activity'
import { useAuthStore } from '@/store/authStore'
import {
  clearUserActivities,
  ensureActivityHistoryEnabled,
  getUserActivities,
  pruneActivities,
} from '@/lib/firebase/activity'

export function useActivityHistory() {
  const { user } = useAuthStore()
  const [activities, setActivities] = useState<ActivityEntry[]>([])
  const [loading, setLoading] = useState(false)

  const loadActivities = useCallback(async () => {
    if (!user) return
    setLoading(true)
    try {
      await ensureActivityHistoryEnabled(user.uid)
      await pruneActivities(user.uid)
      setActivities(await getUserActivities(user.uid))
    } catch {
      toast.error('Failed to load Activity History')
    } finally {
      setLoading(false)
    }
  }, [user])

  useEffect(() => {
    loadActivities()
  }, [loadActivities])

  const clearActivities = useCallback(async () => {
    if (!user) return 0
    const count = await clearUserActivities(user.uid)
    setActivities([])
    return count
  }, [user])

  return {
    activities,
    loading,
    loadActivities,
    clearActivities,
  }
}
