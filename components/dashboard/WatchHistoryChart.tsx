'use client'

import { useMemo } from 'react'
import { useRouter } from 'next/navigation'
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Cell,
} from 'recharts'
import { Calendar } from 'lucide-react'
import { MediaEntry } from '@/types/media'
import { GlassCard } from '@/components/common/GlassCard'
import { getWatchHistoryYear } from '@/utils/watchHistory'

interface WatchHistoryChartProps {
  entries: MediaEntry[]
}

interface CustomTooltipProps {
  active?: boolean
  payload?: Array<{ value: number }>
  label?: string
}

function CustomTooltip({ active, payload, label }: CustomTooltipProps) {
  if (!active || !payload?.length) return null
  return (
    <div className="bg-[#0D0D1A] border border-white/10 rounded-xl px-3 py-2 text-sm shadow-xl">
      <p className="text-white/60 text-xs">{label}</p>
      <p className="text-blue-400 font-semibold">{payload[0].value} titles</p>
    </div>
  )
}

export function WatchHistoryChart({ entries }: WatchHistoryChartProps) {
  const router = useRouter()
  const data = useMemo(() => {
    // Only count completed entries
    const completed = entries.filter((e) => e.status === 'completed')

    // Count per year:
    //   Primary source  → dateFinished year
    //   Fallback source → yearMade (for completed entries with no dateFinished)
    const yearCounts: Record<number, number> = {}

    for (const entry of completed) {
      const year = getWatchHistoryYear(entry)
      if (year != null) {
        yearCounts[year] = (yearCounts[year] || 0) + 1
      }
    }

    if (Object.keys(yearCounts).length === 0) return []

    // Fill every year from the earliest to current year
    const minYear = Math.min(...Object.keys(yearCounts).map(Number))
    const maxYear = new Date().getFullYear()
    const currentYear = maxYear

    return Array.from({ length: maxYear - minYear + 1 }, (_, i) => {
      const year = minYear + i
      return {
        year: String(year),
        count: yearCounts[year] || 0,
        isCurrent: year === currentYear,
      }
    })
  }, [entries])

  const hasData = data.some((d) => d.count > 0)
  const maxCount = hasData ? Math.max(...data.map((d) => d.count)) : 0

  return (
    <GlassCard padding="md">
      <div className="flex items-center gap-2 mb-4">
        <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-emerald-500 to-teal-600 flex items-center justify-center">
          <Calendar className="w-4 h-4 text-white" />
        </div>
        <h3 className="text-base font-semibold text-white">Watch History</h3>
        <span className="text-xs text-white/30 ml-auto">Completed per year</span>
      </div>

      {hasData ? (
        <ResponsiveContainer width="100%" height={180}>
          <BarChart data={data} barSize={18}>
            <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" vertical={false} />
            <XAxis
              dataKey="year"
              tick={{ fill: 'rgba(255,255,255,0.4)', fontSize: 10 }}
              tickLine={false}
              axisLine={false}
            />
            <YAxis
              allowDecimals={false}
              tick={{ fill: 'rgba(255,255,255,0.4)', fontSize: 10 }}
              tickLine={false}
              axisLine={false}
              width={24}
            />
            <Tooltip content={<CustomTooltip />} />
            <Bar dataKey="count" radius={[4, 4, 0, 0]}>
              {data.map((entry, index) => (
                <Cell
                  key={`bar-${index}`}
                  fill={entry.count === maxCount ? '#8B5CF6' : '#3B82F6'}
                  fillOpacity={entry.isCurrent ? 0.6 : 1}
                  cursor={entry.count > 0 ? 'pointer' : 'default'}
                  onClick={entry.count > 0
                    ? () => router.push(`/my-list?watchHistoryYear=${entry.year}&sort=rating_desc&tab=all`)
                    : undefined}
                />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      ) : (
        <div className="h-40 flex items-center justify-center">
          <p className="text-sm text-white/30">Complete entries to see your watch history</p>
        </div>
      )}

      {hasData && (
        <p className="text-[10px] text-white/20 mt-1">
          Uses date finished when available, falls back to release year
        </p>
      )}
    </GlassCard>
  )
}
