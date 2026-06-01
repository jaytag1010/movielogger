'use client'

import { useRouter } from 'next/navigation'
import { motion } from 'framer-motion'
import { AppLayout } from '@/components/layout/AppLayout'
import { AddEntryForm } from '@/components/media/AddEntryForm'
import { GlassCard } from '@/components/common/GlassCard'

export default function AddEntryPage() {
  const router = useRouter()

  return (
    <AppLayout title="Add Entry" subtitle="Track a new movie or series">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
      >
        <GlassCard padding="md">
          <AddEntryForm onSuccess={() => router.push('/my-list')} />
        </GlassCard>
      </motion.div>
    </AppLayout>
  )
}
