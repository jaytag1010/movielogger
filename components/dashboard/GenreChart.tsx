'use client'

import { useMemo } from 'react'
import {
  RadarChart,
  Radar,
  PolarGrid,
  PolarAngleAxis,
  ResponsiveContainer,
  Tooltip,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Cell,
} from 'recharts'
import { Tag } from 'lucide-react'
import { MediaEntry } from '@/types/media'
import { GlassCard } from '@/components/common/GlassCard'

const COLORS = [
  '#3B82F6', '#8B5CF6', '#EC4899', '#10B981', '#F59E0B',
  '#EF4444', '#06B6D4', '#84CC16', '#F97316', '#A855F7',
  '#14B8A6', '#F43F5E',
]

interface GenreChartProps {
  entries: MediaEntry[]
}

interface CustomTooltipProps {
  active?: boolean
  payload?: Array<{ name: string; value: number; payload: { name: string; count: number } }>
}

function CustomTooltip({ active, payload }: CustomTooltipProps) {
  if (!active || !payload?.length) return null
  return (
    <div className="bg-[#0D0D1A] border border-white/10 rounded-xl px-3 py-2 text-sm shadow-xl">
      <p className="text-white font-medium">{payload[0].payload.name}</p>
      <p className="text-purple-400">{payload[0].payload.count} titles</p>
    </div>
  )
}

export function GenreChart({ entries }: GenreChartProps) {
  const data = useMemo(() => {
    const counts: Record<string, number> = {}
    for (const entry of entries) {
      for (const genre of entry.genres || []) {
        if (genre) counts[genre] = (counts[genre] || 0) + 1
      }
    }
    return Object.entries(counts)
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 10)
  }, [entries])

  if (data.length === 0) {
    return (
      <GlassCard padding="md">
        <div className="flex items-center gap-2 mb-4">
          <Tag className="w-5 h-5 text-purple-400" />
          <h3 className="text-base font-semibold text-white">Genre Distribution</h3>
        </div>
        <p className="text-sm text-white/40 text-center py-6">No genre data yet</p>
      </GlassCard>
    )
  }

  return (
    <GlassCard padding="md">
      <div className="flex items-center gap-2 mb-4">
        <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-purple-600 to-pink-600 flex items-center justify-center">
          <Tag className="w-4 h-4 text-white" />
        </div>
        <h3 className="text-base font-semibold text-white">Genre Distribution</h3>
      </div>

      <ResponsiveContainer width="100%" height={220}>
        <BarChart data={data} barSize={16}>
          <XAxis
            dataKey="name"
            tick={{ fill: 'rgba(255,255,255,0.4)', fontSize: 9 }}
            tickLine={false}
            axisLine={false}
            angle={-35}
            textAnchor="end"
            height={60}
          />
          <YAxis
            allowDecimals={false}
            tick={{ fill: 'rgba(255,255,255,0.4)', fontSize: 10 }}
            tickLine={false}
            axisLine={false}
            width={20}
          />
          <Tooltip content={<CustomTooltip />} />
          <Bar dataKey="count" radius={[4, 4, 0, 0]}>
            {data.map((_, index) => (
              <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </GlassCard>
  )
}
