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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'

interface WatchTimeProjectionProps {
  entries: MediaEntry[]
}

const WATCH_SPEEDS = [0.5, 0.75, 1, 1.25, 1.5, 1.75, 2]

function formatProjectionTime(totalHours: number, hoursPerDay: number): string {
  if (totalHours <= 0 || hoursPerDay <= 0) return '0 days'

  const totalDays = totalHours / hoursPerDay
  const years = Math.floor(totalDays / 365)
  const remainingDays = Math.floor(totalDays % 365)
  const remainingHours = Math.floor((totalDays - Math.floor(totalDays)) * hoursPerDay)
  const remainingMinutes = Math.round(
    ((totalDays - Math.floor(totalDays)) * hoursPerDay - remainingHours) * 60
  )

  const parts: string[] = []
  if (years > 0) parts.push(`${years} year${years !== 1 ? 's' : ''}`)
  if (remainingDays > 0) parts.push(`${remainingDays} day${remainingDays !== 1 ? 's' : ''}`)
  if (remainingHours > 0 && years === 0) parts.push(`${remainingHours}h`)
  if (remainingMinutes > 0 && years === 0 && remainingDays === 0) parts.push(`${remainingMinutes}m`)
  return parts.length > 0 ? parts.join(', ') : 'Less than a minute'
}

export function WatchTimeProjection({ entries }: WatchTimeProjectionProps) {
  const [hoursPerDay, setHoursPerDay] = useState<number>(2)
  const [includeRewatchHours, setIncludeRewatchHours] = useState(false)
  const [watchSpeed, setWatchSpeed] = useState(1)

  const completed = entries.filter((e) => e.status === 'completed')
  const projection = calculateWatchTimeProjection(completed, hoursPerDay, { includeRewatchHours })
  const adjustedRuntime = projection.totalHours / watchSpeed
  const timeSaved = Math.max(0, projection.totalHours - adjustedRuntime)
  const adjustedDays = hoursPerDay > 0 ? adjustedRuntime / hoursPerDay : 0
  const adjustedYears = Math.floor(adjustedDays / 365)
  const adjustedRemainingDays = Math.floor(adjustedDays % 365)
  const adjustedRemainingHours = Math.floor((adjustedDays - Math.floor(adjustedDays)) * hoursPerDay)
  const adjustedFormattedTime = formatProjectionTime(adjustedRuntime, hoursPerDay)

  const timeUnits = [
    {
      label: 'Years',
      value: adjustedYears,
      color: 'from-blue-500 to-purple-500',
    },
    {
      label: 'Days',
      value: adjustedRemainingDays,
      color: 'from-purple-500 to-pink-500',
    },
    {
      label: 'Hours',
      value: adjustedRemainingHours,
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
        <div className="grid grid-cols-1 sm:grid-cols-[1fr_8rem] gap-3">
          <div>
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
          </div>
          <div>
            <Label className="text-xs text-white/60 mb-1.5 block">Watch speed</Label>
            <Select value={String(watchSpeed)} onValueChange={(value) => setWatchSpeed(Number(value))}>
              <SelectTrigger className="h-10">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {WATCH_SPEEDS.map((speed) => (
                  <SelectItem key={speed} value={String(speed)}>
                    {speed}x
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
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
          <span>Adjusted runtime at {watchSpeed}x</span>
        </div>
        <p className="text-2xl font-bold text-white">
          {formatWatchHours(adjustedRuntime)}
        </p>
      </div>

      <div className="grid grid-cols-3 gap-2 mb-4">
        <RuntimeStat label="Original Runtime" value={formatWatchHours(projection.totalHours)} />
        <RuntimeStat label="Adjusted Runtime" value={formatWatchHours(adjustedRuntime)} />
        <RuntimeStat label="Time Saved" value={formatWatchHours(timeSaved)} />
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
          {adjustedFormattedTime}
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

function RuntimeStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-white/5 bg-white/[0.03] p-2 text-center">
      <p className="text-[10px] uppercase tracking-wider text-white/30">{label}</p>
      <p className="text-xs font-semibold text-white mt-1">{value}</p>
    </div>
  )
}
