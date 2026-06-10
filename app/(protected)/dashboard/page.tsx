'use client'

import { useEffect } from 'react'
import { motion } from 'framer-motion'
import { AppLayout } from '@/components/layout/AppLayout'
import { StatsCards } from '@/components/dashboard/StatsCards'
import { TopRankingList } from '@/components/dashboard/TopRankingList'
import { CountryChart } from '@/components/dashboard/CountryChart'
import { WatchTimeProjection } from '@/components/dashboard/WatchTimeProjection'
import { WatchHistoryChart } from '@/components/dashboard/WatchHistoryChart'
import { GenreChart } from '@/components/dashboard/GenreChart'
import { GlobalSearch } from '@/components/dashboard/GlobalSearch'
import { DataQualityCenter } from '@/components/dashboard/DataQualityCenter'
import { LoadingSpinner } from '@/components/common/LoadingSpinner'
import { useMedia } from '@/hooks/useMedia'
import { useAuthStore } from '@/store/authStore'

const containerVariants = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: { staggerChildren: 0.1 },
  },
}

const itemVariants = {
  hidden: { opacity: 0, y: 20 },
  visible: { opacity: 1, y: 0 },
}

export default function DashboardPage() {
  const { profileDisplayName } = useAuthStore()
  const { entries, loading, loadEntries } = useMedia()

  // profileDisplayName is pre-seeded from localStorage synchronously, so it is
  // already correct on the very first render — no Google-name flash.
  // We deliberately skip user?.displayName to prevent any flash of the Google name.
  const displayName = profileDisplayName || 'Cinephile'

  const hour = new Date().getHours()
  const greeting = hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening'

  return (
    <AppLayout>
      {/* Hero greeting + Data Quality bell */}
      <motion.div
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
        className="mb-4 flex items-start justify-between gap-3"
      >
        <div>
          <p className="text-sm text-white/40 mb-1">{greeting},</p>
          <h1 className="text-2xl font-bold text-white break-words">
            {displayName}{' '}
            <span className="text-gradient">Dashboard</span>
          </h1>
          <p className="text-sm text-white/40 mt-1">
            {entries.length} titles in your collection
          </p>
        </div>
        <DataQualityCenter />
      </motion.div>

      {/* Global search */}
      <motion.div
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
        className="mb-6 flex"
      >
        <GlobalSearch entries={entries} />
      </motion.div>

      {loading ? (
        <div className="flex items-center justify-center py-20">
          <LoadingSpinner size="lg" text="Loading your collection..." />
        </div>
      ) : (
        <motion.div
          variants={containerVariants}
          initial="hidden"
          animate="visible"
          className="space-y-5"
        >
          {/* Stats Cards */}
          <motion.div variants={itemVariants}>
            <StatsCards entries={entries} />
          </motion.div>

          {/* Watch Time Projection */}
          <motion.div variants={itemVariants}>
            <WatchTimeProjection entries={entries} />
          </motion.div>

          {/* Watch History */}
          <motion.div variants={itemVariants} id="watch-history" className="scroll-mt-20">
            <WatchHistoryChart entries={entries} />
          </motion.div>

          {/* Top Rankings */}
          <motion.div
            variants={itemVariants}
            id="top-rankings"
            className="grid grid-cols-1 sm:grid-cols-2 gap-4 scroll-mt-20"
          >
            <TopRankingList entries={entries} type="movie" />
            <TopRankingList entries={entries} type="series" />
          </motion.div>

          {/* Country Analytics — placed above Genre Distribution */}
          <motion.div variants={itemVariants}>
            <CountryChart entries={entries} />
          </motion.div>

          {/* Genre Distribution */}
          <motion.div variants={itemVariants}>
            <GenreChart entries={entries} />
          </motion.div>
        </motion.div>
      )}
    </AppLayout>
  )
}
