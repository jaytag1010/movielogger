'use client'

import { useState } from 'react'
import { motion } from 'framer-motion'
import {
  XCircle,
  AlertTriangle,
  RefreshCw,
  Upload,
  ChevronDown,
  ChevronUp,
  Sparkles,
  HelpCircle,
  SkipForward,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { ImportPreviewRow } from '@/types/import'
import { MEDIA_STATUS_LABELS } from '@/types/media'
import { cn } from '@/utils/cn'
import { getDisplayTitle } from '@/utils/formatters'

interface ImportPreviewProps {
  rows: ImportPreviewRow[]
  onConfirm: (selectedRows: ImportPreviewRow[]) => Promise<void>
  onReset: () => void
  importing?: boolean
}

export function ImportPreview({ rows, onConfirm, onReset, importing }: ImportPreviewProps) {
  const [expandedRow, setExpandedRow] = useState<number | null>(null)
  const [selected, setSelected] = useState<Set<number>>(
    new Set(rows.filter((r) => r.willImport).map((r) => r.rowIndex))
  )

  // Clean rows: no errors, not an auto-skip duplicate, not needing review
  const cleanRows = rows.filter((r) => r.errors.length === 0 && !r.isDuplicate && !r.needsReview)
  const reviewRows = rows.filter((r) => r.needsReview && r.errors.length === 0)
  const errorRows = rows.filter((r) => r.errors.length > 0)
  const duplicateRows = rows.filter((r) => r.isDuplicate)
  const tmdbMatchedRows = rows.filter((r) => r.tmdbMatch.status === 'matched')
  const selectedRows = rows.filter((r) => selected.has(r.rowIndex))

  function toggleRow(rowIndex: number) {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(rowIndex)) next.delete(rowIndex)
      else next.add(rowIndex)
      return next
    })
  }

  function selectAll() {
    // Select all clean rows + all review rows (pre-checked by default)
    setSelected(new Set([...cleanRows, ...reviewRows].map((r) => r.rowIndex)))
  }

  function selectNone() {
    setSelected(new Set())
  }

  async function handleConfirm() {
    await onConfirm(selectedRows)
  }

  return (
    <div className="space-y-4">
      {/* Summary */}
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <div className="bg-emerald-500/10 border border-emerald-500/20 rounded-xl p-3 text-center">
          <p className="text-2xl font-bold text-emerald-400">{cleanRows.length}</p>
          <p className="text-xs text-emerald-400/70">Ready</p>
        </div>
        <div className="bg-amber-500/10 border border-amber-500/20 rounded-xl p-3 text-center">
          <p className="text-2xl font-bold text-amber-400">{reviewRows.length}</p>
          <p className="text-xs text-amber-400/70">Review</p>
        </div>
        <div className="bg-white/5 border border-white/10 rounded-xl p-3 text-center">
          <p className="text-2xl font-bold text-white/50">{duplicateRows.length}</p>
          <p className="text-xs text-white/30">Auto-skip</p>
        </div>
        <div className="bg-red-500/10 border border-red-500/20 rounded-xl p-3 text-center">
          <p className="text-2xl font-bold text-red-400">{errorRows.length}</p>
          <p className="text-xs text-red-400/70">Errors</p>
        </div>
      </div>

      {reviewRows.length > 0 && (
        <div className="flex items-start gap-2 bg-amber-500/10 border border-amber-500/20 rounded-xl p-3">
          <HelpCircle className="w-4 h-4 text-amber-400 flex-shrink-0 mt-0.5" />
          <p className="text-xs text-amber-300">
            <span className="font-semibold">{reviewRows.length} {reviewRows.length === 1 ? 'entry needs' : 'entries need'} review</span>
            {' '}— pre-checked and will import unless you uncheck them.
          </p>
        </div>
      )}

      {/* Actions */}
      <div className="flex items-center justify-between gap-2">
        <div className="flex gap-2">
          <Button variant="ghost" size="sm" onClick={selectAll} className="text-xs">
            Select All Valid
          </Button>
          <Button variant="ghost" size="sm" onClick={selectNone} className="text-xs text-white/40">
            Deselect All
          </Button>
        </div>
        <span className="text-xs text-white/40">{selected.size} selected</span>
      </div>

      {/* Preview Table */}
      <div className="border border-white/10 rounded-xl overflow-hidden">
        <div className="max-h-[420px] overflow-y-auto">
          {rows.map((row) => {
            const isSelected = selected.has(row.rowIndex)
            const isExpanded = expandedRow === row.rowIndex
            const hasErrors = row.errors.length > 0
            const isDuplicate = row.isDuplicate   // auto-skip — no checkbox
            const needsReview = row.needsReview   // review — checkbox shown
            const hasTmdb = row.tmdbMatch.status === 'matched'

            return (
              <div
                key={row.rowIndex}
                className={cn(
                  'border-b border-white/5 last:border-0 transition-colors',
                  hasErrors
                    ? 'bg-red-500/5'
                    : isDuplicate
                    ? 'bg-white/[0.02]'
                    : needsReview
                    ? 'bg-amber-500/5'
                    : isSelected
                    ? 'bg-emerald-500/5'
                    : 'bg-transparent'
                )}
              >
                <div className="flex items-center gap-3 px-3 py-2.5">
                  {/* Checkbox / status icon */}
                  {hasErrors ? (
                    <div className="w-4 h-4 flex-shrink-0 flex items-center justify-center">
                      <XCircle className="w-4 h-4 text-red-400" />
                    </div>
                  ) : isDuplicate ? (
                    // Auto-skip — no checkbox, just a skip icon
                    <div className="w-4 h-4 flex-shrink-0 flex items-center justify-center">
                      <SkipForward className="w-4 h-4 text-white/20" />
                    </div>
                  ) : (
                    // Clean rows and review rows both get a checkbox
                    <input
                      type="checkbox"
                      checked={isSelected}
                      onChange={() => toggleRow(row.rowIndex)}
                      className={cn(
                        'w-4 h-4 cursor-pointer flex-shrink-0',
                        needsReview ? 'accent-amber-500' : 'accent-blue-500'
                      )}
                    />
                  )}

                  {/* Row content */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-xs text-white/30 flex-shrink-0">#{row.rowIndex}</span>
                      <span className="text-sm font-medium text-white truncate">
                        {row.mapped.title
                          ? getDisplayTitle({ title: row.mapped.title, seasonNumber: row.mapped.seasonNumber })
                          : <span className="text-red-400">No title</span>}
                      </span>
                      {row.mapped.type && (
                        <Badge variant="secondary" className="text-[10px] px-1.5 py-0 flex-shrink-0">
                          {row.mapped.type}
                        </Badge>
                      )}
                      {row.mapped.status && (
                        <span className="text-xs text-white/40 flex-shrink-0">
                          {MEDIA_STATUS_LABELS[row.mapped.status as keyof typeof MEDIA_STATUS_LABELS] || row.mapped.status}
                        </span>
                      )}
                    </div>

                    {/* TMDB match status */}
                    <div className="flex items-center gap-2 mt-0.5">
                      {hasTmdb ? (
                        <span className="flex items-center gap-1 text-xs text-blue-400">
                          <Sparkles className="w-3 h-3" />
                          TMDB: {row.tmdbMatch.result?.title}
                          {row.tmdbMatch.result?.year && ` (${row.tmdbMatch.result.year})`}
                        </span>
                      ) : !hasErrors && !isDuplicate ? (
                        <span className="text-xs text-white/25">No TMDB match</span>
                      ) : null}
                    </div>

                    {isDuplicate && (
                      <p className="text-xs text-white/30 mt-0.5">
                        {row.duplicateType === 'exact_tmdb'
                          ? 'Auto-skip: TMDB ID already in your list'
                          : 'Auto-skip: title + country + year + episodes all match'}
                      </p>
                    )}

                    {needsReview && row.reviewReason && (
                      <p className="text-xs text-amber-400 mt-0.5 flex items-center gap-1">
                        <AlertTriangle className="w-3 h-3 flex-shrink-0" />
                        {row.reviewReason}
                      </p>
                    )}

                    {hasErrors && (
                      <div className="mt-0.5 space-y-0.5">
                        {row.errors.map((err, i) => (
                          <p key={i} className="text-xs text-red-400">
                            {err.field}: {err.message}
                          </p>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* Expand */}
                  <button
                    onClick={() => setExpandedRow(isExpanded ? null : row.rowIndex)}
                    className="flex-shrink-0 text-white/30 hover:text-white/60 p-1"
                  >
                    {isExpanded ? (
                      <ChevronUp className="w-3.5 h-3.5" />
                    ) : (
                      <ChevronDown className="w-3.5 h-3.5" />
                    )}
                  </button>
                </div>

                {/* Expanded details */}
                {isExpanded && (
                  <motion.div
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: 'auto', opacity: 1 }}
                    className="px-3 pb-3"
                  >
                    <div className="bg-white/5 rounded-lg p-2.5 grid grid-cols-2 gap-1.5 text-xs">
                      {Object.entries(row.mapped)
                        .filter(([, v]) => v != null && v !== '' && v !== undefined)
                        .map(([key, value]) => (
                          <div key={key}>
                            <span className="text-white/30">{key}: </span>
                            <span className="text-white/70">
                              {Array.isArray(value) ? value.join(', ') : String(value)}
                            </span>
                          </div>
                        ))}
                      {hasTmdb && (
                        <div className="col-span-2 mt-1 pt-1 border-t border-white/10">
                          <span className="text-blue-400/70">
                            TMDB match: {row.tmdbMatch.result?.title} · confidence {Math.round((row.tmdbMatch.confidence ?? 0) * 100)}%
                          </span>
                        </div>
                      )}
                    </div>
                  </motion.div>
                )}
              </div>
            )
          })}
        </div>
      </div>

      {/* Action buttons */}
      <div className="flex gap-3">
        <Button
          variant="outline"
          className="flex-1"
          onClick={onReset}
          disabled={importing}
        >
          <RefreshCw className="w-4 h-4 mr-2" />
          Start Over
        </Button>
        <Button
          className="flex-1"
          onClick={handleConfirm}
          disabled={selected.size === 0 || importing}
        >
          {importing ? (
            <>
              <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin mr-2" />
              Importing...
            </>
          ) : (
            <>
              <Upload className="w-4 h-4 mr-2" />
              Import {selected.size} {selected.size === 1 ? 'Entry' : 'Entries'}
            </>
          )}
        </Button>
      </div>
    </div>
  )
}
