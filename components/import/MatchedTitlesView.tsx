'use client'

import { TMDBPosterImage } from '@/components/common/TMDBPosterImage'
import { Film, Tv, ArrowLeft } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { ImportPreviewRow } from '@/types/import'

export interface MatchedTitlesViewProps {
  rows: ImportPreviewRow[]
  onBack: () => void
  onAddAll: () => Promise<void>
  loading?: boolean
  progress?: { current: number; total: number; phase: 'building' | 'saving' } | null
}

export function MatchedTitlesView({ rows, onBack, onAddAll, loading, progress }: MatchedTitlesViewProps) {
  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-base font-semibold text-white">
          TMDB Matched ({rows.length})
        </h2>
        <p className="text-sm text-white/40 mt-0.5">
          These titles were confidently matched. Review below, then add all.
        </p>
      </div>

      <div className="overflow-y-auto max-h-[60vh] space-y-1 pr-1">
        {rows.map((row) => {
          const result = row.tmdbMatch.result
          const title = result?.title ?? row.mapped.title ?? '—'
          const year = result?.year
          const type = result?.type ?? row.mapped.type
          const posterUrl = result?.posterUrl ?? null

          return (
            <div
              key={row.rowIndex}
              className="flex items-center gap-3 px-3 py-2.5 rounded-lg bg-white/5 border border-white/10"
            >
              <div className="w-8 h-12 rounded overflow-hidden flex-shrink-0 bg-white/10 flex items-center justify-center">
                {posterUrl ? (
                  <TMDBPosterImage
                    src={posterUrl}
                    alt={title}
                    width={32}
                    height={48}
                    className="object-cover w-full h-full"
                    unoptimized
                  />
                ) : type === 'series' ? (
                  <Tv className="w-4 h-4 text-white/30" />
                ) : (
                  <Film className="w-4 h-4 text-white/30" />
                )}
              </div>

              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-white truncate">{title}</p>
                {year && (
                  <p className="text-xs text-white/40">{year}</p>
                )}
              </div>

              <Badge
                variant="outline"
                className={
                  type === 'series'
                    ? 'text-blue-400 border-blue-500/30 text-[10px] px-1.5 py-0 flex-shrink-0'
                    : 'text-purple-400 border-purple-500/30 text-[10px] px-1.5 py-0 flex-shrink-0'
                }
              >
                {type === 'series' ? 'Series' : 'Movie'}
              </Badge>
            </div>
          )
        })}
      </div>

      <div className="flex gap-3 pt-1">
        <Button variant="outline" onClick={onBack} disabled={loading} className="flex items-center gap-1.5">
          <ArrowLeft className="w-4 h-4" />
          Back
        </Button>
        <Button onClick={onAddAll} disabled={loading} className="flex-1">
          {progress ? (
            <span className="flex flex-col items-center leading-tight">
              <span className="text-xs font-semibold">
                {progress.phase === 'saving' ? 'Saving to your list…' : 'Adding Titles…'}
              </span>
              <span className="text-[10px] text-white/70 tabular-nums">
                {progress.current} / {progress.total} ({progress.total > 0 ? Math.round((progress.current / progress.total) * 100) : 0}%)
              </span>
            </span>
          ) : loading ? (
            <span className="flex items-center gap-2">
              <span className="w-4 h-4 border-2 border-white/20 border-t-white rounded-full animate-spin" />
              Adding…
            </span>
          ) : (
            `Add All ${rows.length} Title${rows.length === 1 ? '' : 's'}`
          )}
        </Button>
      </div>
    </div>
  )
}
