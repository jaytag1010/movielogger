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
  const [showOthers, setShowOthers] = useState(false)

  const { data, othersBreakdown } = useMemo<{ data: ChartData[]; othersBreakdown: ChartData[] }>(() => {
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
      .map(([name, value]) => ({ name, value: Math.round(value * 10) / 10 }))
      .sort((a, b) => b.value - a.value)

    if (sorted.length <= MAX_COUNTRIES) return { data: sorted, othersBreakdown: [] }

    // United States must always appear as its own category — never merged into "Others".
    // Pull it out before the top-N slice so the slot count is correct.
    const usEntry   = sorted.find((e) => e.name === 'United States') ?? null
    const remaining = sorted.filter((e) => e.name !== 'United States')

    // Allocate one slot for US (if present), the rest go to other countries
    const otherSlots = usEntry ? MAX_COUNTRIES - 1 : MAX_COUNTRIES
    const top  = remaining.slice(0, otherSlots)
    const rest = remaining.slice(otherSlots)

    // Re-insert United States into the top list at its natural rank position
    if (usEntry) {
      const insertIdx = top.findIndex((e) => e.value < usEntry.value)
      if (insertIdx === -1) top.push(usEntry)
      else top.splice(insertIdx, 0, usEntry)
    }

    const othersValue = rest.reduce((sum, d) => sum + d.value, 0)
    if (othersValue > 0) {
      top.push({ name: 'Others', value: Math.round(othersValue * 10) / 10 })
    }
    return { data: top, othersBreakdown: rest }
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

          {/* Others breakdown — which countries are aggregated into "Others" */}
          {othersBreakdown.length > 0 && (
            <button
              type="button"
              onClick={() => setShowOthers((v) => !v)}
              className="mt-3 w-full text-left rounded-lg border border-white/10 bg-white/5 px-3 py-2 hover:bg-white/[0.07] transition-colors"
              title={othersBreakdown.map((c) => c.name).join(', ')}
            >
              <div className="flex items-center justify-between gap-2">
                <span className="text-xs text-white/60">
                  <span className="font-medium text-white/80">Others:</span>{' '}
                  {othersBreakdown.slice(0, 3).map((c) => c.name).join(', ')}
                  {othersBreakdown.length > 3 && (
                    <span className="text-white/40"> +{othersBreakdown.length - 3} more</span>
                  )}
                </span>
                <span className="text-[10px] text-blue-400 flex-shrink-0">
                  {showOthers ? 'Hide' : 'Show all'}
                </span>
              </div>

              {showOthers && (
                <div className="mt-2 pt-2 border-t border-white/10 grid grid-cols-2 gap-x-3 gap-y-1">
                  {othersBreakdown.map((c) => (
                    <div key={c.name} className="flex items-center justify-between gap-2">
                      <span className="text-xs text-white/50 truncate">{c.name}</span>
                      <span className="text-[10px] text-white/40 tabular-nums flex-shrink-0">
                        {mode === 'titles'
                          ? `${c.value} title${c.value !== 1 ? 's' : ''}`
                          : `${c.value} hrs`}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </button>
          )}
        </>
      )}
    </GlassCard>
  )
}
