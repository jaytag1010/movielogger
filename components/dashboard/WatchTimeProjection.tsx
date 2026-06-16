'use client'

import { useState } from 'react'
import { motion } from 'framer-motion'
import { Clock, Zap } from 'lucide-react'
import { MediaEntry } from '@/types/media'
import { calculateWatchTimeProjection } from '@/utils/watchTime'
import { formatWatchHours } from '@/utils/formatters'
import { GlassCard } from '@/components/common/GlassCard'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

interface WatchTimeProjectionProps {
  entries: MediaEntry[]
}

export function WatchTimeProjection({ entries }: WatchTimeProjectionProps) {
  const [hoursPerDay, setHoursPerDay] = useState<number>(2)
  const [includeRewatchHours, setIncludeRewatchHours] = useState(false)

  const completed = entries.filter((e) => e.status === 'completed')
  const projection = calculateWatchTimeProjection(completed, hoursPerDay, { includeRewatchHours })

  const timeUnits = [
    {
      label: 'Years',
      value: projection.yearsToFinish,
      color: 'from-blue-500 to-purple-500',
    },
    {
      label: 'Days',
      value: projection.daysToFinish,
      color: 'from-purple-500 to-pink-500',
    },
    {
      label: 'Hours',
      value: projection.hoursRemaining,
      color: 'from-amber-500 to-orange-500',
    },
  ]

  return (
    <GlassCard padding="md" gradient>
      <div className="flex items-center gap-2 mb-4">
        <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-amber-500 to-orange-600 flex items-center justify-center">
          <Zap className="w-4 h-4 text-white" />
        </div>
        <div>
          <h3 className="text-base font-semibold text-white">Watch Time Projection</h3>
          <p className="text-xs text-white/40">
            If someone watches your entire list
          </p>
        </div>
      </div>

      {/* Hours per day input */}
      <div className="mb-5">
        <Label className="text-xs text-white/60 mb-1.5 block">Hours watched per day</Label>
        <div className="flex items-center gap-3">
          <Input
            type="number"
            min={0.5}
            max={24}
            step={0.5}
            value={hoursPerDay}
            onChange={(e) => setHoursPerDay(Math.max(0.5, Math.min(24, Number(e.target.value))))}
            className="w-24 text-center"
          />
          <input
            type="range"
            min={0.5}
            max={12}
            step={0.5}
            value={hoursPerDay}
            onChange={(e) => setHoursPerDay(Number(e.target.value))}
            className="flex-1 accent-blue-500 h-2 rounded-full"
          />
        </div>
        <label className="mt-3 flex items-center gap-2 text-xs text-white/60 cursor-pointer">
          <input
            type="checkbox"
            checked={includeRewatchHours}
            onChange={(e) => setIncludeRewatchHours(e.target.checked)}
            className="h-4 w-4 rounded border-white/20 bg-white/5 accent-blue-500"
          />
          Include Rewatch Hours
        </label>
      </div>

      {/* Total hours */}
      <div className="text-center mb-4 p-3 bg-white/5 rounded-xl border border-white/5">
        <div className="flex items-center justify-center gap-2 text-white/50 text-xs mb-1">
          <Clock className="w-3.5 h-3.5" />
          <span>Total content watched</span>
        </div>
        <p className="text-2xl font-bold text-white">
          {projection.totalHours.toFixed(2)}
          <span className="text-sm font-normal text-white/50 ml-1">hours</span>
        </p>
      </div>

      {/* Time breakdown */}
      <div className="grid grid-cols-3 gap-2 mb-4">
        {timeUnits.map((unit, i) => (
          <motion.div
            key={unit.label}
            initial={{ scale: 0.8, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ delay: i * 0.1 }}
            className="text-center p-3 bg-white/5 rounded-xl border border-white/5"
          >
            <div
              className={`text-2xl font-bold bg-gradient-to-r ${unit.color} bg-clip-text text-transparent`}
            >
              {unit.value}
            </div>
            <div className="text-xs text-white/40 mt-0.5">{unit.label}</div>
          </motion.div>
        ))}
      </div>

      {/* Summary text */}
      <div className="text-center p-3 rounded-xl bg-gradient-to-r from-blue-600/10 to-purple-600/10 border border-blue-500/10">
        <p className="text-sm text-white/70">
          At <span className="text-blue-400 font-semibold">{hoursPerDay}h/day</span>, it would take
        </p>
        <p className="text-base font-bold text-white mt-0.5">
          {projection.formattedTime}
        </p>
        <p className="text-xs text-white/40 mt-0.5">to watch everything you've logged</p>
      </div>

      {completed.length === 0 && (
        <p className="text-xs text-white/30 text-center mt-3">
          Add completed entries to see projections
        </p>
      )}
    </GlassCard>
  )
}
