'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { MediaEntry } from '@/types/media'
import { computeDataQuality, DataQualityResult } from '@/lib/dataQuality'

const IGNORED_KEY = 'movielogger-dq-ignored-duplicates'

function loadIgnored(): Set<string> {
  if (typeof window === 'undefined') return new Set()
  try {
    const raw = localStorage.getItem(IGNORED_KEY)
    if (!raw) return new Set()
    const arr = JSON.parse(raw) as string[]
    return new Set(Array.isArray(arr) ? arr : [])
  } catch {
    return new Set()
  }
}

export function useDataQuality(entries: MediaEntry[]): {
  result: DataQualityResult
  ignoreDuplicate: (key: string) => void
} {
  const [ignored, setIgnored] = useState<Set<string>>(new Set())

  useEffect(() => {
    setIgnored(loadIgnored())
  }, [])

  const ignoreDuplicate = useCallback((key: string) => {
    setIgnored((prev) => {
      const next = new Set(prev)
      next.add(key)
      try {
        localStorage.setItem(IGNORED_KEY, JSON.stringify(Array.from(next)))
      } catch {
        /* ignore persistence failure */
      }
      return next
    })
  }, [])

  const result = useMemo(
    () => computeDataQuality(entries, ignored),
    [entries, ignored]
  )

  return { result, ignoreDuplicate }
}
