'use client'

import { useMemo } from 'react'
import {
  PieChart,
  Pie,
  Cell,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
} from 'recharts'
import { Globe } from 'lucide-react'
import { MediaEntry } from '@/types/media'
import { GlassCard } from '@/components/common/GlassCard'
import { normalizeCountry } from '@/utils/countries'

const COLORS = [
  '#3B82F6', '#8B5CF6', '#EC4899', '#10B981', '#F59E0B',
  '#EF4444', '#06B6D4', '#84CC16', '#F97316', '#A855F7',
]

interface CountryChartProps {
  entries: MediaEntry[]
}

interface ChartData {
  name: string
  value: number
}

interface CustomTooltipProps {
  active?: boolean
  payload?: Array<{ name: string; value: number; payload: ChartData }>
}

function CustomTooltip({ active, payload }: CustomTooltipProps) {
  if (!active || !payload?.length) return null
  return (
    <div className="bg-[#0D0D1A] border border-white/10 rounded-xl px-3 py-2 text-sm shadow-xl">
      <p className="text-white font-medium">{payload[0].payload.name}</p>
      <p className="text-blue-400">{payload[0].value} titles</p>
    </div>
  )
}

export function CountryChart({ entries }: CountryChartProps) {
  const data = useMemo<ChartData[]>(() => {
    const counts: Record<string, number> = {}
    for (const entry of entries) {
      // Normalise stored ISO codes (e.g. "TH") to full names ("Thailand")
      // so that TV series and movies for the same country are counted together.
      const country = normalizeCountry(entry.country) || 'Unknown'
      counts[country] = (counts[country] || 0) + 1
    }
    return Object.entries(counts)
      .map(([name, value]) => ({ name, value }))
      .sort((a, b) => b.value - a.value)
      .slice(0, 8)
  }, [entries])

  if (data.length === 0) {
    return (
      <GlassCard padding="md">
        <div className="flex items-center gap-2 mb-4">
          <Globe className="w-5 h-5 text-blue-400" />
          <h3 className="text-base font-semibold text-white">Countries</h3>
        </div>
        <p className="text-sm text-white/40 text-center py-6">No country data yet</p>
      </GlassCard>
    )
  }

  return (
    <GlassCard padding="md">
      <div className="flex items-center gap-2 mb-4">
        <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-blue-600 to-cyan-600 flex items-center justify-center">
          <Globe className="w-4 h-4 text-white" />
        </div>
        <h3 className="text-base font-semibold text-white">Countries</h3>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {/* Pie Chart */}
        <div>
          <ResponsiveContainer width="100%" height={180}>
            <PieChart>
              <Pie
                data={data}
                cx="50%"
                cy="50%"
                innerRadius={45}
                outerRadius={75}
                paddingAngle={3}
                dataKey="value"
              >
                {data.map((_, index) => (
                  <Cell
                    key={`cell-${index}`}
                    fill={COLORS[index % COLORS.length]}
                    stroke="transparent"
                  />
                ))}
              </Pie>
              <Tooltip content={<CustomTooltip />} />
            </PieChart>
          </ResponsiveContainer>
        </div>

        {/* Bar Chart */}
        <div>
          <ResponsiveContainer width="100%" height={180}>
            <BarChart data={data} layout="vertical" barSize={8}>
              <XAxis type="number" hide />
              <YAxis
                dataKey="name"
                type="category"
                width={80}
                tick={{ fill: 'rgba(255,255,255,0.5)', fontSize: 10 }}
                tickLine={false}
                axisLine={false}
              />
              <Tooltip content={<CustomTooltip />} />
              <Bar dataKey="value" radius={[0, 4, 4, 0]}>
                {data.map((_, index) => (
                  <Cell key={`bar-cell-${index}`} fill={COLORS[index % COLORS.length]} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Legend */}
      <div className="flex flex-wrap gap-2 mt-2">
        {data.slice(0, 6).map((item, index) => (
          <div key={item.name} className="flex items-center gap-1.5">
            <div
              className="w-2 h-2 rounded-full"
              style={{ backgroundColor: COLORS[index % COLORS.length] }}
            />
            <span className="text-xs text-white/50">{item.name}</span>
          </div>
        ))}
      </div>
    </GlassCard>
  )
}
