'use client'

import { useMemo, useState } from 'react'
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'

// ── Types ────────────────────────────────────────────────────────────────────

type CountryMode = 'titles' | 'hours'

interface CountryChartProps {
  entries: MediaEntry[]
}

interface ChartData {
  name: string
  value: number
}

// ── Constants ────────────────────────────────────────────────────────────────

const COLORS = [
  '#3B82F6', // blue
  '#8B5CF6', // violet
  '#EC4899', // pink
  '#10B981', // emerald
  '#F59E0B', // amber
  '#EF4444', // red
  '#94A3B8', // slate — used for "Others"
]

/** Maximum individual countries before the rest collapse into "Others". */
const MAX_COUNTRIES = 6

// ── Tooltip ──────────────────────────────────────────────────────────────────

function makeTooltip(mode: CountryMode) {
  // eslint-disable-next-line react/display-name
  return function TooltipContent({ active, payload }: {
    active?: boolean
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    payload?: any[]
  }) {
    if (!active || !payload?.length) return null
    const d = payload[0].payload as ChartData
    const label =
      mode === 'titles'
        ? `${d.value} title${d.value !== 1 ? 's' : ''}`
        : `${Number.isInteger(d.value) ? d.value : d.value.toFixed(1)} hrs`
    return (
      <div className="bg-[#0D0D1A] border border-white/10 rounded-xl px-3 py-2 text-sm shadow-xl">
        <p className="text-white font-medium">{d.name}</p>
        <p className="text-blue-400">{label}</p>
      </div>
    )
  }
}

// ── Component ────────────────────────────────────────────────────────────────

export function CountryChart({ entries }: CountryChartProps) {
  const [mode, setMode] = useState<CountryMode>('titles')

  const data = useMemo<ChartData[]>(() => {
    // Authority: only completed titles count toward country analytics
    const completed = entries.filter((e) => e.status === 'completed')

    const totals: Record<string, number> = {}

    for (const entry of completed) {
      // Country authority:
      //   1. TMDB country — already stored in entry.country when TMDB-linked
      //   2. Imported spreadsheet country (fallback)
      //   3. Skip entries with no country data
      const country = normalizeCountry(entry.country)
      if (!country) continue // no country data — don't pollute chart

      if (mode === 'titles') {
        totals[country] = (totals[country] || 0) + 1
      } else {
        // Hours mode: skip entries with no watchHours
        const hours = entry.watchHours ?? 0
        if (hours === 0) continue
        totals[country] = (totals[country] || 0) + hours
      }
    }

    const sorted = Object.entries(totals)
      .map(([name, value]) => ({ name, value }))
      .sort((a, b) => b.value - a.value)

    if (sorted.length <= MAX_COUNTRIES) return sorted

    // Top 6 + collapse the rest into "Others"
    const top = sorted.slice(0, MAX_COUNTRIES)
    const othersValue = sorted
      .slice(MAX_COUNTRIES)
      .reduce((sum, d) => sum + d.value, 0)

    if (othersValue > 0) {
      top.push({ name: 'Others', value: Math.round(othersValue * 10) / 10 })
    }
    return top
  }, [entries, mode])

  // Recreate tooltip component when mode changes so it captures the new value
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const TooltipContent = useMemo(() => makeTooltip(mode), [mode])

  return (
    <GlassCard padding="md">
      {/* Header + mode selector */}
      <div className="flex items-center gap-2 mb-3">
        <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-blue-600 to-cyan-600 flex items-center justify-center flex-shrink-0">
          <Globe className="w-4 h-4 text-white" />
        </div>
        <h3 className="text-base font-semibold text-white flex-1">Countries</h3>

        <Select value={mode} onValueChange={(v) => setMode(v as CountryMode)}>
          <SelectTrigger className="h-7 text-xs w-auto min-w-[136px] border-white/10 bg-white/5">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="titles">Titles Watched</SelectItem>
            <SelectItem value="hours">Watch Hours</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {data.length === 0 ? (
        <p className="text-sm text-white/40 text-center py-6">
          {mode === 'titles'
            ? 'No completed titles with country data yet'
            : 'No completed titles with watch-hour data yet'}
        </p>
      ) : (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {/* Pie chart */}
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
                  <Tooltip content={<TooltipContent />} />
                </PieChart>
              </ResponsiveContainer>
            </div>

            {/* Bar chart */}
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
                  <Tooltip content={<TooltipContent />} />
                  <Bar dataKey="value" radius={[0, 4, 4, 0]}>
                    {data.map((_, index) => (
                      <Cell
                        key={`bar-cell-${index}`}
                        fill={COLORS[index % COLORS.length]}
                      />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* Legend */}
          <div className="flex flex-wrap gap-2 mt-2">
            {data.map((item, index) => (
              <div key={item.name} className="flex items-center gap-1.5">
                <div
                  className="w-2 h-2 rounded-full flex-shrink-0"
                  style={{ backgroundColor: COLORS[index % COLORS.length] }}
                />
                <span className="text-xs text-white/50">{item.name}</span>
              </div>
            ))}
          </div>
        </>
      )}
    </GlassCard>
  )
}
