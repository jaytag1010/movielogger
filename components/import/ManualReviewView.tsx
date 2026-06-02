'use client'

import { Button } from '@/components/ui/button'
import { ReviewCard } from './ReviewCard'
import { ImportPreviewRow, ReviewCardEdits } from '@/types/import'
import { NormalizedTMDBResult } from '@/types/tmdb'

export interface ManualReviewViewProps {
  queue: ImportPreviewRow[]
  edits: Record<number, ReviewCardEdits>
  tmdbLinks: Record<number, NormalizedTMDBResult>
  onSaveEdits: (rowIndex: number, edits: ReviewCardEdits) => void
  onLinkTMDB: (rowIndex: number, result: NormalizedTMDBResult) => void
  onAddOne: (rowIndex: number) => Promise<void>
  onAddRemaining: () => void
  onSkipRemaining: () => void
  loading?: boolean
  loadingRowIndex?: number | null
  progress?: { current: number; total: number } | null
}

export function ManualReviewView({
  queue,
  edits,
  tmdbLinks,
  onSaveEdits,
  onLinkTMDB,
  onAddOne,
  onAddRemaining,
  onSkipRemaining,
  loading,
  loadingRowIndex,
  progress,
}: ManualReviewViewProps) {
  const remaining = queue.length

  return (
    <div className="flex flex-col h-full">
      <div className="mb-3">
        <h2 className="text-base font-semibold text-white">Manual Review Recommended</h2>
        <p className="text-sm text-white/40 mt-0.5">
          Remaining: <span className="text-white/70 font-medium">{remaining}</span>
        </p>
      </div>

      <div className="overflow-y-auto max-h-[60vh] space-y-2 pr-1 flex-1">
        {queue.map((row) => (
          <ReviewCard
            key={row.rowIndex}
            row={row}
            edits={edits[row.rowIndex]}
            tmdbLink={tmdbLinks[row.rowIndex]}
            onSaveEdits={onSaveEdits}
            onLinkTMDB={onLinkTMDB}
            onAddOne={onAddOne}
            loading={loadingRowIndex === row.rowIndex}
          />
        ))}
      </div>

      <div className="border-t border-white/10 pt-4 mt-4 flex gap-3">
        <Button
          variant="outline"
          onClick={onSkipRemaining}
          disabled={loading || loadingRowIndex != null}
          className="flex-1 text-white/60 hover:text-white"
        >
          Don&apos;t Add Remaining {remaining}
        </Button>
        <Button
          onClick={onAddRemaining}
          disabled={loading || loadingRowIndex != null}
          className="flex-1"
        >
          {progress ? (
            <span className="flex flex-col items-center leading-tight">
              <span className="text-xs font-semibold">Adding Remaining…</span>
              <span className="text-[10px] text-white/70 tabular-nums">
                {progress.current} / {progress.total} ({Math.round((progress.current / progress.total) * 100)}%)
              </span>
            </span>
          ) : loading && loadingRowIndex == null ? (
            <span className="flex items-center gap-2">
              <span className="w-4 h-4 border-2 border-white/20 border-t-white rounded-full animate-spin" />
              Adding…
            </span>
          ) : (
            `Add Remaining ${remaining} to List`
          )}
        </Button>
      </div>
    </div>
  )
}
