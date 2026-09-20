'use client'

import { Clock3, Clapperboard, Film, Library, Star, Tv } from 'lucide-react'
import type { MediaEntry } from '@/types/media'
import { getEffectiveMediaType } from '@/utils/formatters'
import { calculateTotalWatchHours } from '@/utils/watchTime'

export function OverallSummary({ entries }: { entries: MediaEntry[] }) {
  const completed = entries.filter((entry) => entry.status === 'completed')
  const ratings = entries.map((entry) => entry.personalRating).filter((value): value is number => value != null && Number.isFinite(value))
  const items = [
    { label: 'Total Titles', value: entries.length.toLocaleString(), icon: Library, tone: 'text-blue-300' },
    { label: 'Movies', value: entries.filter((entry) => getEffectiveMediaType(entry) === 'movie').length.toLocaleString(), icon: Film, tone: 'text-cyan-300' },
    { label: 'Series', value: entries.filter((entry) => getEffectiveMediaType(entry) === 'series').length.toLocaleString(), icon: Tv, tone: 'text-purple-300' },
    { label: 'Shorts', value: entries.filter((entry) => getEffectiveMediaType(entry) === 'shorts').length.toLocaleString(), icon: Clapperboard, tone: 'text-pink-300' },
    { label: 'Watch Time', value: `${calculateTotalWatchHours(completed).toFixed(2)} h`, icon: Clock3, tone: 'text-emerald-300' },
    { label: 'Avg. Rating', value: ratings.length ? (ratings.reduce((sum, value) => sum + value, 0) / ratings.length).toFixed(1) : '—', icon: Star, tone: 'text-amber-300' },
  ]
  return <section>
    <h3 className="mb-3 text-xs font-semibold uppercase tracking-wider text-white/40">Overall Summary</h3>
    <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 xl:grid-cols-6">
      {items.map(({ label, value, icon: Icon, tone }) => <div key={label} className="min-w-0 rounded-lg border border-white/10 bg-white/[0.035] p-3">
        <div className="flex items-center justify-between gap-2"><p className="truncate text-[10px] font-semibold uppercase text-white/35">{label}</p><Icon className={`h-4 w-4 shrink-0 ${tone}`} /></div>
        <p className="mt-2 truncate text-lg font-semibold text-white">{value}</p>
      </div>)}
    </div>
  </section>
}
