'use client'

import { useState } from 'react'
import { motion } from 'framer-motion'
import {
  CheckCircle,
  SkipForward,
  AlertTriangle,
  XCircle,
  Download,
  FileText,
  Sparkles,
  ChevronDown,
  ChevronUp,
  Lightbulb,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { ImportReport, ImportReportRow } from '@/types/import'
import { cn } from '@/utils/cn'
import Papa from 'papaparse'

interface ImportReportProps {
  report: ImportReport
  onImportMore: () => void
  onViewList: () => void
}

const RESULT_CONFIG = {
  imported: {
    label: 'Imported',
    icon: CheckCircle,
    color: 'text-emerald-400',
    bg: 'bg-emerald-500/10',
    border: 'border-emerald-500/20',
  },
  imported_reviewed: {
    label: 'Imported (Reviewed)',
    icon: AlertTriangle,
    color: 'text-amber-400',
    bg: 'bg-amber-500/10',
    border: 'border-amber-500/20',
  },
  skipped_duplicate: {
    label: 'Skipped (Duplicate)',
    icon: SkipForward,
    color: 'text-white/40',
    bg: 'bg-white/5',
    border: 'border-white/10',
  },
  skipped_error: {
    label: 'Failed',
    icon: XCircle,
    color: 'text-red-400',
    bg: 'bg-red-500/10',
    border: 'border-red-500/20',
  },
} as const

/**
 * Generate a human-readable suggested fix based on the error reason string.
 */
function getSuggestedFix(reason: string): string | null {
  const r = reason.toLowerCase()
  if (r.includes('title') && r.includes('required')) {
    return 'Add a title in the Title column for this row.'
  }
  if (r.includes('type') && (r.includes('must be') || r.includes('invalid'))) {
    return 'Set the Type column to either "movie" or "series".'
  }
  if (r.includes('rating')) {
    return 'Enter a number between 0 and 10 in the Rating column.'
  }
  if (r.includes('year') && r.includes('invalid')) {
    return 'Check the Year Made field — must be a 4-digit year (1888–present).'
  }
  if (r.includes('failed to build') || r.includes('error')) {
    return 'Re-import this row manually via Add Entry, or check for unusual characters.'
  }
  return null
}

function downloadCSV(rows: ImportReportRow[], filename: string) {
  const csvData = rows.map((r) => ({
    'Row #': r.rowIndex,
    Title: r.title,
    Result: RESULT_CONFIG[r.result].label,
    Reason: r.reason,
    'Suggested Fix': getSuggestedFix(r.reason) ?? '',
    'TMDB Match': r.tmdbMatch || '—',
  }))
  const csv = Papa.unparse(csvData)
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  link.click()
  URL.revokeObjectURL(url)
}

export function ImportReportView({ report, onImportMore, onViewList }: ImportReportProps) {
  const [errorsExpanded, setErrorsExpanded] = useState(true)
  const [allRowsExpanded, setAllRowsExpanded] = useState(false)

  const errorRows = report.rows.filter((r) => r.result === 'skipped_error')
  const nonErrorRows = report.rows.filter((r) => r.result !== 'skipped_error')

  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      className="space-y-5"
    >
      {/* Header */}
      <div className="text-center">
        <div className="w-16 h-16 rounded-full bg-emerald-500/20 flex items-center justify-center mx-auto mb-4">
          <CheckCircle className="w-8 h-8 text-emerald-400" />
        </div>
        <h2 className="text-xl font-bold text-white">Import Complete</h2>
        <p className="text-white/40 text-sm mt-1">
          {new Date(report.timestamp).toLocaleString()}
        </p>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-2 gap-3">
        <div className="bg-emerald-500/10 border border-emerald-500/20 rounded-xl p-4 text-center">
          <p className="text-3xl font-bold text-emerald-400">{report.importedCount}</p>
          <p className="text-xs text-emerald-400/70 mt-0.5">Imported</p>
        </div>
        <div className="bg-amber-500/10 border border-amber-500/20 rounded-xl p-4 text-center">
          <p className="text-3xl font-bold text-amber-400">{report.duplicateCount}</p>
          <p className="text-xs text-amber-400/70 mt-0.5">Duplicates Skipped</p>
        </div>
        {report.similarFlaggedCount > 0 && (
          <div className="bg-amber-500/10 border border-amber-500/20 rounded-xl p-4 text-center">
            <p className="text-3xl font-bold text-amber-400">{report.similarFlaggedCount}</p>
            <p className="text-xs text-amber-400/70 mt-0.5">Imported After Review</p>
          </div>
        )}
        {report.failedCount > 0 && (
          <div className="bg-red-500/10 border border-red-500/20 rounded-xl p-4 text-center">
            <p className="text-3xl font-bold text-red-400">{report.failedCount}</p>
            <p className="text-xs text-red-400/70 mt-0.5">Failed</p>
          </div>
        )}
      </div>

      {/* ── Errors section (prominent, always at top when failures exist) ── */}
      {errorRows.length > 0 && (
        <div className="border border-red-500/30 rounded-xl overflow-hidden">
          <button
            type="button"
            onClick={() => setErrorsExpanded((v) => !v)}
            className="w-full flex items-center justify-between px-4 py-3 bg-red-500/10 hover:bg-red-500/15 transition-colors"
          >
            <div className="flex items-center gap-2.5">
              <XCircle className="w-4 h-4 text-red-400 flex-shrink-0" />
              <span className="text-sm font-semibold text-red-400">
                {errorRows.length} Failed Row{errorRows.length !== 1 ? 's' : ''}
              </span>
              <span className="text-xs text-red-400/60">
                — these were not imported
              </span>
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation()
                  downloadCSV(
                    errorRows,
                    `import-failures-${report.timestamp.toISOString().slice(0, 10)}.csv`
                  )
                }}
                className="inline-flex items-center gap-1 text-[10px] font-medium text-red-400/80 hover:text-red-300 border border-red-500/30 rounded-full px-2.5 py-1 bg-red-500/10 hover:bg-red-500/20 transition-all"
              >
                <Download className="w-3 h-3" />
                Export Failed Rows
              </button>
              {errorsExpanded
                ? <ChevronUp className="w-4 h-4 text-red-400/60" />
                : <ChevronDown className="w-4 h-4 text-red-400/60" />}
            </div>
          </button>

          {errorsExpanded && (
            <div className="divide-y divide-red-500/10">
              {errorRows.map((row) => {
                const fix = getSuggestedFix(row.reason)
                return (
                  <div key={row.rowIndex} className="px-4 py-3 bg-red-500/5">
                    {/* Row header */}
                    <div className="flex items-center gap-2 mb-1.5">
                      <span className="text-[10px] font-mono text-red-400/50 bg-red-500/10 border border-red-500/20 rounded px-1.5 py-0.5">
                        Row {row.rowIndex}
                      </span>
                      <span className="text-sm font-semibold text-white">{row.title}</span>
                    </div>

                    {/* Reason */}
                    <div className="flex items-start gap-1.5 ml-0.5">
                      <XCircle className="w-3.5 h-3.5 text-red-400 flex-shrink-0 mt-0.5" />
                      <p className="text-xs text-red-300/80">{row.reason}</p>
                    </div>

                    {/* Suggested fix */}
                    {fix && (
                      <div className="flex items-start gap-1.5 mt-1 ml-0.5">
                        <Lightbulb className="w-3.5 h-3.5 text-amber-400 flex-shrink-0 mt-0.5" />
                        <p className="text-xs text-amber-300/70">{fix}</p>
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          )}
        </div>
      )}

      {/* ── Full row-by-row breakdown (collapsed by default to avoid overwhelming UI) ── */}
      <div className="space-y-1.5">
        <button
          type="button"
          onClick={() => setAllRowsExpanded((v) => !v)}
          className="w-full flex items-center justify-between"
        >
          <h3 className="text-sm font-semibold text-white/60 uppercase tracking-wider">
            All Rows ({report.rows.length})
          </h3>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation()
                downloadCSV(
                  report.rows,
                  `import-report-${report.timestamp.toISOString().slice(0, 10)}.csv`
                )
              }}
              className="inline-flex items-center gap-1.5 text-xs text-white/50 hover:text-white/80 transition-colors"
            >
              <Download className="w-3.5 h-3.5" />
              Download Full Report
            </button>
            {allRowsExpanded
              ? <ChevronUp className="w-4 h-4 text-white/30" />
              : <ChevronDown className="w-4 h-4 text-white/30" />}
          </div>
        </button>

        {allRowsExpanded && (
          <div className="border border-white/10 rounded-xl overflow-hidden max-h-72 overflow-y-auto">
            {report.rows.map((row) => {
              const config = RESULT_CONFIG[row.result]
              const Icon = config.icon
              return (
                <div
                  key={row.rowIndex}
                  className={cn(
                    'flex items-start gap-3 px-3 py-2.5 border-b border-white/5 last:border-0',
                    config.bg
                  )}
                >
                  <Icon className={cn('w-4 h-4 flex-shrink-0 mt-0.5', config.color)} />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-xs text-white/30">#{row.rowIndex}</span>
                      <span className="text-sm font-medium text-white truncate">{row.title}</span>
                      <Badge
                        variant="outline"
                        className={cn('text-[10px] px-1.5 py-0 border flex-shrink-0', config.color, config.border)}
                      >
                        {config.label}
                      </Badge>
                    </div>
                    <p className="text-xs text-white/40 mt-0.5">{row.reason}</p>
                    {row.tmdbMatch && (
                      <p className="text-xs text-blue-400/70 mt-0.5 flex items-center gap-1">
                        <Sparkles className="w-3 h-3" />
                        {row.tmdbMatch}
                      </p>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>

      {/* Actions */}
      <div className="flex gap-3">
        <Button variant="outline" className="flex-1" onClick={onImportMore}>
          <FileText className="w-4 h-4 mr-2" />
          Import More
        </Button>
        <Button className="flex-1" onClick={onViewList}>
          View My List
        </Button>
      </div>
    </motion.div>
  )
}
