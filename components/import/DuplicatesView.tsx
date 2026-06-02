'use client'

import { Film, Tv } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { ImportPreviewRow } from '@/types/import'

export interface DuplicatesViewProps {
  rows: ImportPreviewRow[]
  onSkipAll: () => void
  onImportAll: () => void
}

const DUPLICATE_TYPE_LABELS: Record<string, string> = {
  exact_tmdb: 'TMDB ID match',
  legacy: 'Title + metadata match',
  exact_title: 'Exact title match',
  similar_title: 'Similar title match',
}

export function DuplicatesView({ rows, onSkipAll, onImportAll }: DuplicatesViewProps) {
  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-base font-semibold text-white">Duplicates ({rows.length})</h2>
        <p className="text-sm text-white/40 mt-0.5">
          These titles already exist in your library.
        </p>
      </div>

      <div className="overflow-y-auto max-h-[55vh] divide-y divide-white/10 border border-white/10 rounded-xl overflow-hidden">
        {rows.map((row) => {
          const isMovie = (row.mapped.type ?? row.existingEntry?.type) !== 'series'
          const title = row.mapped.title ?? row.existingEntry?.title ?? '—'
          const dupeLabel = row.duplicateType ? DUPLICATE_TYPE_LABELS[row.duplicateType] : 'Duplicate'

          return (
            <div key={row.rowIndex} className="flex items-start gap-3 px-4 py-3 bg-white/[0.02]">
              <div className="w-8 h-8 rounded-lg bg-white/10 flex items-center justify-center flex-shrink-0 mt-0.5">
                {isMovie
                  ? <Film className="w-4 h-4 text-white/40" />
                  : <Tv className="w-4 h-4 text-white/40" />}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-white truncate">{title}</p>
                <p className="text-xs text-white/40">Already exists in your library</p>
                <p className="text-xs text-white/25 mt-0.5">Duplicate type: {dupeLabel}</p>
              </div>
            </div>
          )
        })}
      </div>

      <div className="flex gap-3">
        <Button variant="outline" onClick={onSkipAll} className="flex-1">
          Skip All Duplicates
        </Button>
        <Button onClick={onImportAll} className="flex-1">
          Import Anyway
        </Button>
      </div>
    </div>
  )
}
