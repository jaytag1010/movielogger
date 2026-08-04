'use client'

import { useMemo, useState } from 'react'
import {
  AlertTriangle,
  CheckCircle2,
  ChevronDown,
  Clock,
  Download,
  Edit3,
  Film,
  History,
  Link2,
  RefreshCw,
  Search,
  Trash2,
  Upload,
  Wrench,
} from 'lucide-react'
import { toast } from 'sonner'
import { ActivityCategory, ActivityEntry } from '@/types/activity'
import { useActivityHistory } from '@/hooks/useActivityHistory'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { cn } from '@/utils/cn'

const ITEMS_PER_PAGE = 20
const PAGE_GROUP_SIZE = 5

type FilterValue = 'all' | ActivityCategory | 'import_export'

const FILTERS: { label: string; value: FilterValue }[] = [
  { label: 'All Activities', value: 'all' },
  { label: 'Library', value: 'library' },
  { label: 'TMDB', value: 'tmdb' },
  { label: 'Refresh', value: 'refresh' },
  { label: 'Import / Export', value: 'import_export' },
]

function activityDate(entry: ActivityEntry): Date {
  return entry.createdAt?.toDate?.() ?? new Date(0)
}

function formatTimestamp(entry: ActivityEntry): string {
  return activityDate(entry).toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  })
}

function startOfDay(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate())
}

function groupLabel(entry: ActivityEntry): string {
  const now = new Date()
  const date = activityDate(entry)
  const today = startOfDay(now).getTime()
  const entryDay = startOfDay(date).getTime()
  const diffDays = Math.round((today - entryDay) / 86400000)
  if (diffDays === 0) return 'Today'
  if (diffDays === 1) return 'Yesterday'
  if (diffDays < 7) return 'Earlier This Week'
  if (date.getFullYear() === now.getFullYear() && date.getMonth() === now.getMonth()) {
    return 'Earlier This Month'
  }
  return 'Older'
}

function IconForActivity({ activity }: { activity: ActivityEntry }) {
  const iconClass = 'w-4 h-4'
  if (activity.category === 'tmdb') return <Link2 className={cn(iconClass, 'text-indigo-300')} />
  if (activity.category === 'refresh') return <RefreshCw className={cn(iconClass, 'text-emerald-300')} />
  if (activity.category === 'maintenance') return <Wrench className={cn(iconClass, 'text-blue-300')} />
  if (activity.category === 'import_export') {
    return activity.action.includes('Export')
      ? <Download className={cn(iconClass, 'text-cyan-300')} />
      : <Upload className={cn(iconClass, 'text-purple-300')} />
  }
  if (activity.action.includes('Deleted') || activity.action.includes('Clear')) {
    return <Trash2 className={cn(iconClass, 'text-red-300')} />
  }
  if (activity.action.includes('Edited') || activity.action.includes('Changed')) {
    return <Edit3 className={cn(iconClass, 'text-amber-300')} />
  }
  if (activity.action.includes('Finished')) return <CheckCircle2 className={cn(iconClass, 'text-emerald-300')} />
  if (activity.category === 'system') return <History className={cn(iconClass, 'text-white/50')} />
  return <Film className={cn(iconClass, 'text-white/50')} />
}

export function ActivityHistory() {
  const { activities, loading, clearActivities } = useActivityHistory()
  const [filter, setFilter] = useState<FilterValue>('all')
  const [search, setSearch] = useState('')
  const [expanded, setExpanded] = useState<Set<string>>(new Set())
  const [page, setPage] = useState(1)
  const [pageGroupStart, setPageGroupStart] = useState(1)
  const [clearing, setClearing] = useState(false)

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase()
    return activities.filter((activity) => {
      if (filter !== 'all' && activity.category !== filter) return false
      if (!term) return true
      return [
        activity.action,
        activity.summary,
        activity.title,
        activity.internalId,
        activity.snapshot?.title,
        activity.snapshot?.internalId,
      ].some((value) => String(value ?? '').toLowerCase().includes(term))
    })
  }, [activities, filter, search])

  const totalPages = Math.max(1, Math.ceil(filtered.length / ITEMS_PER_PAGE))
  const safePage = Math.min(page, totalPages)
  const paged = filtered.slice((safePage - 1) * ITEMS_PER_PAGE, safePage * ITEMS_PER_PAGE)
  const lastGroupStart = Math.max(1, Math.floor((totalPages - 1) / PAGE_GROUP_SIZE) * PAGE_GROUP_SIZE + 1)
  const safeGroupStart = Math.min(pageGroupStart, lastGroupStart)
  const visiblePages = Array.from(
    { length: Math.min(PAGE_GROUP_SIZE, totalPages - safeGroupStart + 1) },
    (_, index) => safeGroupStart + index
  )

  function resetPaging() {
    setPage(1)
    setPageGroupStart(1)
  }

  function toggle(id: string | undefined) {
    if (!id) return
    setExpanded((current) => {
      const next = new Set(current)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  async function handleClearHistory() {
    if (!confirm('Permanently delete Activity History? This does not affect your library.')) return
    setClearing(true)
    try {
      const count = await clearActivities()
      toast.success(`Cleared ${count} activity entr${count === 1 ? 'y' : 'ies'}`)
    } catch {
      toast.error('Failed to clear Activity History')
    } finally {
      setClearing(false)
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h3 className="text-sm font-semibold text-white">Activity History</h3>
          <p className="text-xs text-white/40 mt-0.5">
            Meaningful library actions from Deployment 40 onward.
          </p>
        </div>
        <Button
          size="sm"
          variant="outline"
          className="text-red-300/80 border-red-400/20 hover:bg-red-500/10"
          onClick={handleClearHistory}
          disabled={clearing || activities.length === 0}
        >
          {clearing ? <Clock className="w-4 h-4 mr-2 animate-spin" /> : <Trash2 className="w-4 h-4 mr-2" />}
          Clear Activity History
        </Button>
      </div>

      <div className="space-y-3">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-white/30" />
          <Input
            value={search}
            onChange={(event) => {
              setSearch(event.target.value)
              resetPaging()
            }}
            placeholder="Search by title, ML ID, or action..."
            className="pl-9"
          />
        </div>
        <div className="flex gap-1.5 flex-wrap">
          {FILTERS.map((item) => (
            <button
              key={item.value}
              type="button"
              onClick={() => {
                setFilter(item.value)
                resetPaging()
              }}
              className={cn(
                'rounded-full border px-3 py-1.5 text-xs font-medium transition-colors',
                filter === item.value
                  ? 'border-blue-500/40 bg-blue-600/20 text-blue-200'
                  : 'border-white/10 bg-white/5 text-white/45 hover:bg-white/10 hover:text-white/70'
              )}
            >
              {item.label}
            </button>
          ))}
        </div>
      </div>

      <div className="rounded-xl border border-white/10 overflow-hidden">
        {loading ? (
          <div className="py-10 text-center text-sm text-white/40">Loading Activity History...</div>
        ) : paged.length === 0 ? (
          <div className="py-10 text-center">
            <AlertTriangle className="w-8 h-8 text-white/15 mx-auto mb-2" />
            <p className="text-sm text-white/45">No activity found.</p>
          </div>
        ) : (
          <ActivityGroups activities={paged} expanded={expanded} onToggle={toggle} />
        )}
      </div>

      {!loading && totalPages > 1 && (
        <Pagination
          currentPage={safePage}
          totalPages={totalPages}
          visiblePages={visiblePages}
          groupStart={safeGroupStart}
          lastGroupStart={lastGroupStart}
          onFirstGroup={() => setPageGroupStart(1)}
          onPrevGroup={() => setPageGroupStart((current) => Math.max(1, current - PAGE_GROUP_SIZE))}
          onNextGroup={() => setPageGroupStart((current) => Math.min(lastGroupStart, current + PAGE_GROUP_SIZE))}
          onLastGroup={() => setPageGroupStart(lastGroupStart)}
          onSelectPage={setPage}
        />
      )}
    </div>
  )
}

function ActivityGroups({
  activities,
  expanded,
  onToggle,
}: {
  activities: ActivityEntry[]
  expanded: Set<string>
  onToggle: (id: string | undefined) => void
}) {
  let previousGroup = ''
  return (
    <div className="divide-y divide-white/5">
      {activities.map((activity) => {
        const group = groupLabel(activity)
        const showGroup = group !== previousGroup
        previousGroup = group
        return (
          <div key={activity.id}>
            {showGroup && (
              <div className="bg-white/[0.03] px-3 py-2 text-[10px] font-semibold uppercase tracking-wider text-white/35">
                {group}
              </div>
            )}
            <ActivityRow
              activity={activity}
              expanded={activity.id ? expanded.has(activity.id) : false}
              onToggle={() => onToggle(activity.id)}
            />
          </div>
        )
      })}
    </div>
  )
}

function ActivityRow({
  activity,
  expanded,
  onToggle,
}: {
  activity: ActivityEntry
  expanded: boolean
  onToggle: () => void
}) {
  const hasDetails = Boolean(activity.details?.length || activity.items?.length || activity.snapshot)
  return (
    <div>
      <button
        type="button"
        onClick={hasDetails ? onToggle : undefined}
        className="w-full px-3 py-3 flex items-start gap-3 text-left hover:bg-white/[0.03] transition-colors"
      >
        <div className="mt-0.5 w-8 h-8 rounded-lg bg-white/5 border border-white/10 flex items-center justify-center shrink-0">
          <IconForActivity activity={activity} />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 min-w-0">
            <p className="text-sm font-semibold text-white truncate">{activity.action}</p>
            {activity.internalId && (
              <span className="text-[10px] rounded-full bg-white/5 border border-white/10 px-1.5 py-0.5 text-white/35">
                {activity.internalId}
              </span>
            )}
          </div>
          <p className="text-xs text-white/50 mt-0.5 line-clamp-2">{activity.summary}</p>
          <p className="text-[10px] text-white/30 mt-1">{formatTimestamp(activity)}</p>
        </div>
        {hasDetails && (
          <ChevronDown className={cn('w-4 h-4 mt-2 text-white/30 transition-transform', expanded && 'rotate-180')} />
        )}
      </button>

      {expanded && hasDetails && (
        <div className="px-14 pb-3 space-y-2">
          {activity.details?.map((detail) => (
            <DetailLine key={`${detail.label}-${detail.before}-${detail.after}`} label={detail.label} before={detail.before} after={detail.after} />
          ))}

          {activity.items?.map((item) => (
            <div key={item.title} className="rounded-lg border border-white/10 bg-black/20 p-2">
              <p className="text-xs font-semibold text-white mb-1">{item.title}</p>
              <div className="space-y-1">
                {item.details.map((detail) => (
                  <DetailLine key={`${item.title}-${detail.label}`} label={detail.label} before={detail.before} after={detail.after} compact />
                ))}
              </div>
            </div>
          ))}

          {activity.snapshot && (
            <div className="rounded-lg border border-white/10 bg-white/[0.03] p-2 grid grid-cols-2 gap-1 text-[11px] text-white/45">
              <span>Title: <span className="text-white/70">{activity.snapshot.title}</span></span>
              <span>Year: <span className="text-white/70">{activity.snapshot.yearMade ?? 'None'}</span></span>
              <span>Type: <span className="text-white/70">{activity.snapshot.type ?? 'None'}</span></span>
              <span>Status: <span className="text-white/70">{activity.snapshot.status ?? 'None'}</span></span>
              <span>Rating: <span className="text-white/70">{activity.snapshot.rating ?? 'None'}</span></span>
              <span>TMDB ID: <span className="text-white/70">{activity.snapshot.tmdbId ?? 'None'}</span></span>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

function DetailLine({
  label,
  before,
  after,
  compact = false,
}: {
  label: string
  before?: string | number | null
  after?: string | number | null
  compact?: boolean
}) {
  return (
    <div className={cn('text-xs text-white/45', compact && 'text-[11px]')}>
      <span className="text-white/70">{label}</span>
      {before !== undefined || after !== undefined ? (
        <>
          <span className="mx-1.5">{before ?? 'None'}</span>
          <span className="text-blue-300">→</span>
          <span className="ml-1.5 text-white/70">{after ?? 'None'}</span>
        </>
      ) : null}
    </div>
  )
}

function Pagination({
  currentPage,
  visiblePages,
  groupStart,
  lastGroupStart,
  onFirstGroup,
  onPrevGroup,
  onNextGroup,
  onLastGroup,
  onSelectPage,
}: {
  currentPage: number
  totalPages: number
  visiblePages: number[]
  groupStart: number
  lastGroupStart: number
  onFirstGroup: () => void
  onPrevGroup: () => void
  onNextGroup: () => void
  onLastGroup: () => void
  onSelectPage: (page: number) => void
}) {
  const atFirstGroup = groupStart <= 1
  const atLastGroup = groupStart >= lastGroupStart
  return (
    <nav className="flex items-center justify-center gap-1.5 flex-wrap" aria-label="Activity pagination">
      <PageButton label="«" disabled={atFirstGroup} onClick={onFirstGroup} />
      <PageButton label="<" disabled={atFirstGroup} onClick={onPrevGroup} />
      {visiblePages.map((page) => (
        <PageButton key={page} label={String(page)} active={page === currentPage} onClick={() => onSelectPage(page)} />
      ))}
      <PageButton label=">" disabled={atLastGroup} onClick={onNextGroup} />
      <PageButton label="»" disabled={atLastGroup} onClick={onLastGroup} />
    </nav>
  )
}

function PageButton({
  label,
  active = false,
  disabled = false,
  onClick,
}: {
  label: string
  active?: boolean
  disabled?: boolean
  onClick: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={cn(
        'min-w-9 h-9 px-2 rounded-lg border text-sm font-semibold transition-colors',
        active
          ? 'bg-blue-600/25 border-blue-500/50 text-blue-200'
          : 'bg-white/5 border-white/10 text-white/55 hover:bg-white/10 hover:text-white',
        disabled && 'opacity-35 cursor-not-allowed hover:bg-white/5 hover:text-white/55'
      )}
    >
      {label}
    </button>
  )
}
