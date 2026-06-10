'use client'

import { useRouter, useSearchParams } from 'next/navigation'
import { motion } from 'framer-motion'
import { AppLayout } from '@/components/layout/AppLayout'
import { AddEntryForm } from '@/components/media/AddEntryForm'
import { GlassCard } from '@/components/common/GlassCard'

export default function AddEntryPage() {
  const router = useRouter()
  const searchParams = useSearchParams()

  // Prefill TMDB data when arriving from GlobalSearch "Add to Library"
  const rawTmdbId   = searchParams.get('tmdbId')
  const rawTmdbType = searchParams.get('tmdbType')
  const tmdbPreload =
    rawTmdbId && (rawTmdbType === 'movie' || rawTmdbType === 'series')
      ? { tmdbId: parseInt(rawTmdbId, 10), tmdbType: rawTmdbType as 'movie' | 'series' }
      : undefined

  return (
    <AppLayout title="Add Entry" subtitle="Track a new movie or series">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
      >
        <GlassCard padding="md">
          <AddEntryForm
            onSuccess={() => router.push('/my-list')}
            onCancel={() => router.back()}
            tmdbPreload={tmdbPreload}
          />
        </GlassCard>
      </motion.div>
    </AppLayout>
  )
}
