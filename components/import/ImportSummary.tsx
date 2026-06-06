'use client'

import { CheckCircle, AlertTriangle, RefreshCw, XCircle } from 'lucide-react'
import { Button } from '@/components/ui/button'

export interface ImportSummaryProps {
  matchedCount: number
  reviewCount: number
  duplicateCount: number
  errorCount: number
  ignoredEmptyRows: number
  totalRowsRead: number
  onContinue: () => void
  onCancel: () => void
}

export function ImportSummary({
  matchedCount,
  reviewCount,
  duplicateCount,
  errorCount,
  ignoredEmptyRows,
  totalRowsRead,
  onContinue,
  onCancel,
}: ImportSummaryProps) {
  const nothingToImport = matchedCount + reviewCount + duplicateCount === 0

  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-base font-semibold text-white">Import Summary</h2>
        <p className="text-sm text-white/40 mt-0.5">
          Total Rows Read: <span className="text-white/70 font-medium">{totalRowsRead}</span>
        </p>
      </div>

      <div className="space-y-2">
        <SummaryRow
          icon={<CheckCircle className="w-4 h-4 text-emerald-400" />}
          label="Auto Matched"
          count={matchedCount}
          countColor="text-emerald-400"
        />
        <SummaryRow
          icon={<AlertTriangle className="w-4 h-4 text-amber-400" />}
          label="Manual Review Recommended"
          count={reviewCount}
          countColor="text-amber-400"
        />
        <SummaryRow
          icon={<RefreshCw className="w-4 h-4 text-white/40" />}
          label="Duplicates"
          count={duplicateCount}
          countColor="text-white/60"
        />
        <SummaryRow
          icon={<XCircle className="w-4 h-4 text-red-400" />}
          label="Invalid Rows"
          count={errorCount}
          countColor="text-red-400"
        />

        {ignoredEmptyRows > 0 && (
          <>
            <div className="border-t border-white/10 my-2" />
            <SummaryRow
              icon={<span className="w-4 h-4 flex items-center justify-center text-white/20 text-xs">—</span>}
              label="Ignored Empty Rows"
              count={ignoredEmptyRows}
              countColor="text-white/30"
              muted
            />
          </>
        )}
      </div>

      {nothingToImport && (
        <p className="text-sm text-white/40 italic">
          Nothing to import — all rows are invalid, empty, or already in your library.
        </p>
      )}

      <div className="flex gap-3 pt-1">
        <Button variant="outline" onClick={onCancel} className="flex-1">
          Cancel
        </Button>
        <Button
          onClick={onContinue}
          disabled={nothingToImport}
          className="flex-1"
        >
          Continue →
        </Button>
      </div>
    </div>
  )
}

function SummaryRow({
  icon,
  label,
  count,
  countColor,
  muted,
}: {
  icon: React.ReactNode
  label: string
  count: number
  countColor: string
  muted?: boolean
}) {
  return (
    <div className={`flex items-center justify-between py-1.5 ${muted ? 'opacity-50' : ''}`}>
      <div className="flex items-center gap-2.5">
        {icon}
        <span className="text-sm text-white/70">{label}</span>
      </div>
      <span className={`text-sm font-semibold tabular-nums ${countColor}`}>{count}</span>
    </div>
  )
}
