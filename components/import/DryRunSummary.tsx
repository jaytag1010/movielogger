'use client'

import { motion } from 'framer-motion'
import {
  CheckCircle,
  Sparkles,
  AlertTriangle,
  SkipForward,
  XCircle,
  ArrowRight,
  RefreshCw,
  ClipboardList,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { ImportPreviewRow } from '@/types/import'

interface DryRunSummaryProps {
  rows: ImportPreviewRow[]
  onReview: () => void
  onReset: () => void
}

interface StatRowProps {
  icon: React.ReactNode
  label: string
  count: number
  color: string
  bg: string
  border: string
  note?: string
}

function StatRow({ icon, label, count, color, bg, border, note }: StatRowProps) {
  return (
    <div className={`flex items-center gap-3 rounded-xl px-4 py-3 border ${bg} ${border}`}>
      <div className={`flex-shrink-0 ${color}`}>{icon}</div>
      <div className="flex-1 min-w-0">
        <p className={`text-sm font-medium ${color}`}>{label}</p>
        {note && <p className="text-xs text-white/30 mt-0.5">{note}</p>}
      </div>
      <p className={`text-2xl font-bold tabular-nums ${color}`}>{count}</p>
    </div>
  )
}

export function DryRunSummary({ rows, onReview, onReset }: DryRunSummaryProps) {
  const total = rows.length

  // Counts
  const readyCount = rows.filter(
    (r) => r.errors.length === 0 && !r.isDuplicate && !r.needsReview
  ).length
  const tmdbMatchedCount = rows.filter((r) => r.tmdbMatch.status === 'matched').length
  const reviewCount = rows.filter((r) => r.needsReview && r.errors.length === 0).length
  const duplicateCount = rows.filter((r) => r.isDuplicate).length
  const errorCount = rows.filter((r) => r.errors.length > 0).length

  const willImportCount = rows.filter((r) => r.willImport).length

  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      className="space-y-5"
    >
      {/* Header */}
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-blue-600/30 to-purple-600/30 border border-white/10 flex items-center justify-center flex-shrink-0">
          <ClipboardList className="w-5 h-5 text-blue-400" />
        </div>
        <div>
          <h2 className="text-base font-semibold text-white">Dry Run Complete</h2>
          <p className="text-sm text-white/40">
            {total} row{total !== 1 ? 's' : ''} analyzed — no data written yet
          </p>
        </div>
      </div>

      {/* Stats */}
      <div className="space-y-2">
        <StatRow
          icon={<CheckCircle className="w-5 h-5" />}
          label="Ready to import"
          count={readyCount}
          color="text-emerald-400"
          bg="bg-emerald-500/10"
          border="border-emerald-500/20"
          note="Clean rows with no conflicts"
        />

        <StatRow
          icon={<Sparkles className="w-5 h-5" />}
          label="TMDB matched"
          count={tmdbMatchedCount}
          color="text-blue-400"
          bg="bg-blue-500/10"
          border="border-blue-500/20"
          note="Will be enriched with poster, genres, age rating"
        />

        {reviewCount > 0 && (
          <StatRow
            icon={<AlertTriangle className="w-5 h-5" />}
            label="Review required"
            count={reviewCount}
            color="text-amber-400"
            bg="bg-amber-500/10"
            border="border-amber-500/20"
            note="Title already exists or similar title found — pre-checked, you can uncheck"
          />
        )}

        {duplicateCount > 0 && (
          <StatRow
            icon={<SkipForward className="w-5 h-5" />}
            label="Auto-skipped duplicates"
            count={duplicateCount}
            color="text-white/40"
            bg="bg-white/5"
            border="border-white/10"
            note="TMDB ID match or title + country + year + episodes all match"
          />
        )}

        {errorCount > 0 && (
          <StatRow
            icon={<XCircle className="w-5 h-5" />}
            label="Rows with errors"
            count={errorCount}
            color="text-red-400"
            bg="bg-red-500/10"
            border="border-red-500/20"
            note="Missing required fields — will not be imported"
          />
        )}
      </div>

      {/* Net summary line */}
      <div className="bg-white/5 border border-white/10 rounded-xl px-4 py-3 flex items-center justify-between">
        <p className="text-sm text-white/60">Net entries to import</p>
        <p className="text-lg font-bold text-white tabular-nums">
          {willImportCount}
          <span className="text-sm font-normal text-white/30 ml-1">/ {total}</span>
        </p>
      </div>

      {willImportCount === 0 && (
        <div className="bg-amber-500/10 border border-amber-500/20 rounded-xl px-4 py-3 text-sm text-amber-300">
          No rows are ready to import. Check the errors and try again.
        </div>
      )}

      {/* Actions */}
      <div className="flex gap-3">
        <Button variant="outline" className="flex-1" onClick={onReset}>
          <RefreshCw className="w-4 h-4 mr-2" />
          Start Over
        </Button>
        <Button
          className="flex-1"
          onClick={onReview}
          disabled={willImportCount === 0}
        >
          Review &amp; Import
          <ArrowRight className="w-4 h-4 ml-2" />
        </Button>
      </div>
    </motion.div>
  )
}
