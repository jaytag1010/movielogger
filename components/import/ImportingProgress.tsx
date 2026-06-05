'use client'

import { Progress } from '@/components/ui/progress'

interface ImportingProgressProps {
  progress: { current: number; total: number }
}

export function ImportingProgress({ progress }: ImportingProgressProps) {
  const { current, total } = progress
  const pct = total > 0 ? (current / total) * 100 : 0
  const pctDisplay = pct.toFixed(1)

  return (
    <div className="py-10 text-center space-y-5">
      <p className="text-white font-semibold text-base tracking-wide">Importing Titles</p>

      <p className="tabular-nums leading-none">
        <span className="text-5xl font-bold text-emerald-400">{current}</span>
        <span className="text-2xl text-white/30 ml-2">/ {total}</span>
      </p>

      <p className="text-xl font-medium text-white/50 tabular-nums">{pctDisplay}%</p>

      <div className="max-w-xs mx-auto">
        <Progress value={pct} className="h-2" />
      </div>
    </div>
  )
}
