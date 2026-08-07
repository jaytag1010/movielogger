'use client'

export const dynamic = 'force-dynamic'

import { useState, useEffect, useMemo, useRef } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { motion, AnimatePresence } from 'framer-motion'
import { toast } from 'sonner'
import { AppLayout } from '@/components/layout/AppLayout'
import { MediaCard } from '@/components/media/MediaCard'
import { InfoGridCard } from '@/components/media/InfoGridCard'
import { TitleDetailsModal } from '@/components/media/TitleDetailsModal'
import { FilterBar } from '@/components/media/FilterBar'
import { EditEntryModal } from '@/components/media/EditEntryModal'
import { LoadingSpinner } from '@/components/common/LoadingSpinner'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { useMedia } from '@/hooks/useMedia'
import { useMediaStore } from '@/store/mediaStore'
import { MediaEntry } from '@/types/media'
import { getEffectiveMediaType } from '@/utils/formatters'
import { getWatchHistoryEntries } from '@/utils/watchHistory'
import { Film, Tv, List } from 'lucide-react'

const ITEMS_PER_PAGE = 20

type SortByValue = 'title' | 'rating' | 'year' | 'dateFinished' | 'createdAt' | 'priority'

export default function MyListPage() {
  const { entries, filteredEntries, loading, removeEntry } = useMedia()
  const { activeTab, filters, setActiveTab, resetFilters } = useMediaStore()
  const searchParams = useSearchParams()
  const router = useRouter()
  const watchHistoryYearParam = searchParams.get('watchHistoryYear')
  const watchHistoryYear = watchHistoryYearParam && /^\d{4}$/.test(watchHistoryYearParam)
    ? Number(watchHistoryYearParam)
    : null

  // Apply navigation intent from URL params (e.g. dashboard stat cards / See All).
  // ?tab=all|movie|series  ·  ?sort=title_asc|rating_desc|year_desc|createdAt_desc
  // ?country=South+Korea   ·  (from Country Chart drill-down)
  useEffect(() => {
    const tab = searchParams.get('tab')
    if (tab === 'all' || tab === 'movie' || tab === 'series') {
      setActiveTab(tab)
    }
    const sort = searchParams.get('sort')
    if (sort) {
      const [by, order] = sort.split('_')
      const validBy: SortByValue[] = ['title', 'rating', 'year', 'dateFinished', 'createdAt', 'priority']
      if (validBy.includes(by as SortByValue) && (order === 'asc' || order === 'desc')) {
        useMediaStore.getState().setFilters({ sortBy: by as SortByValue, sortOrder: order })
      }
    }
    if (watchHistoryYear != null) {
      setActiveTab('all')
      resetPagination()
      useMediaStore.getState().setFilters({
        search: '',
        type: 'all',
        status: 'all',
        genre: 'all',
        country: 'all',
        year: 'all',
        ageRating: 'all',
        sortBy: 'rating',
        sortOrder: 'desc',
      })
    }
    // Country drill-down from dashboard chart: ?country=South+Korea
    // Resets status to 'all' so the user sees every title from that country.
    const country = searchParams.get('country')
    if (country) {
      useMediaStore.getState().setFilters({ country, status: 'all' })
    }
    // Genre drill-down from dashboard Genre chart: ?genre=Drama
    const genre = searchParams.get('genre')
    if (genre) {
      useMediaStore.getState().setFilters({ genre, status: 'all' })
    }
    if (searchParams.get('ids')) {
      setActiveTab('all')
      resetPagination()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams])

  // Open Title Details for a specific entry when arriving via ?entry=<id>
  // (used by global search, dashboard drill-downs, and the Data Quality Center).
  // We track the last-opened entry ID in a ref so that Zustand store updates
  // (which fire when an entry is saved) do NOT re-call setEditingEntry while
  // the modal is already open — that would reset the modal mid-save.
  useEffect(() => {
    const entryId = searchParams.get('entry')
    if (!entryId || entries.length === 0) return
    // Already opened for this entry — don't disrupt an in-progress save.
    if (openedEntryIdRef.current === entryId) return
    const target = entries.find((e) => e.id === entryId)
    if (target) {
      openedEntryIdRef.current = entryId
      setDetailEntryId(target.id ?? null)
      setDetailOpen(true)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams, entries])
  const [editingEntry, setEditingEntry] = useState<MediaEntry | null>(null)
  const [editOpen, setEditOpen] = useState(false)
  const [detailEntryId, setDetailEntryId] = useState<string | null>(null)
  const [detailOpen, setDetailOpen] = useState(false)
  const [returnToDetailId, setReturnToDetailId] = useState<string | null>(null)
  // Tracks which ?entry=<id> we have already opened so store updates
  // (triggered by saves) don't re-fire setEditingEntry mid-save.
  const openedEntryIdRef = useRef<string | null>(null)
  const [page, setPage] = useState(1)
  const [pageGroupStart, setPageGroupStart] = useState(1)
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const listTopRef = useRef<HTMLDivElement>(null)

  const VIEW_MODE_KEY = 'movielogger-view-mode'
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid')

  const resetPagination = () => {
    setPage(1)
    setPageGroupStart(1)
  }

  // Initialise from localStorage on mount; write back on change
  useEffect(() => {
    const stored = localStorage.getItem(VIEW_MODE_KEY)
    if (stored === 'grid' || stored === 'list') setViewMode(stored)
    if (stored === 'card') setViewMode('grid')
    if (stored === 'table') setViewMode('list')
  }, [])

  function handleViewModeChange(mode: 'grid' | 'list') {
    setViewMode(mode)
    localStorage.setItem(VIEW_MODE_KEY, mode)
  }

  const movieCount = entries.filter((e) => getEffectiveMediaType(e) === 'movie').length
  const seriesCount = entries.filter((e) => getEffectiveMediaType(e) === 'series').length
  const filteredIdsParam = searchParams.get('ids')
  const filteredLabel = searchParams.get('label')
  const filteredIdSet = useMemo(() => {
    if (!filteredIdsParam) return null
    const ids = filteredIdsParam.split(',').map((id) => id.trim()).filter(Boolean)
    return ids.length > 0 ? new Set(ids) : null
  }, [filteredIdsParam])
  const issueFilteredEntries = useMemo(() => {
    if (!filteredIdSet) return null
    return entries.filter((e) => e.id && filteredIdSet.has(e.id))
  }, [entries, filteredIdSet])

  const watchHistoryEntries = useMemo(() => {
    if (watchHistoryYear == null) return null
    return getWatchHistoryEntries(entries, watchHistoryYear).sort(
      (a, b) => (b.personalRating ?? 0) - (a.personalRating ?? 0) || a.title.localeCompare(b.title)
    )
  }, [entries, watchHistoryYear])

  // For "All" tab, show all filteredEntries; otherwise filter by effective type
  const baseEntries = watchHistoryEntries ?? issueFilteredEntries ?? filteredEntries
  const tabEntries =
    activeTab === 'all'
      ? baseEntries
      : baseEntries.filter((e) => getEffectiveMediaType(e) === activeTab)

  const totalPages = Math.max(1, Math.ceil(tabEntries.length / ITEMS_PER_PAGE))
  const safePage = Math.min(page, totalPages)
  const paginatedEntries = tabEntries.slice(
    (safePage - 1) * ITEMS_PER_PAGE,
    safePage * ITEMS_PER_PAGE
  )
  const pageGroupSize = 5
  const lastGroupStart = Math.max(1, Math.floor((totalPages - 1) / pageGroupSize) * pageGroupSize + 1)
  const safeGroupStart = Math.min(pageGroupStart, lastGroupStart)
  const visiblePages = Array.from(
    { length: Math.min(pageGroupSize, totalPages - safeGroupStart + 1) },
    (_, index) => safeGroupStart + index
  )

  useEffect(() => {
    setPage(1)
    setPageGroupStart(1)
  }, [
    activeTab,
    filters.search,
    filters.type,
    filters.status,
    filters.genre,
    filters.country,
    filters.year,
    filters.ageRating,
    filters.sortBy,
    filters.sortOrder,
    watchHistoryYearParam,
    filteredIdsParam,
  ])

  useEffect(() => {
    if (page > totalPages) setPage(totalPages)
    if (pageGroupStart > lastGroupStart) setPageGroupStart(lastGroupStart)
  }, [lastGroupStart, page, pageGroupStart, totalPages])

  function selectPage(nextPage: number) {
    setPage(nextPage)
    requestAnimationFrame(() => {
      listTopRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
    })
  }

  function handleEdit(entry: MediaEntry) {
    setEditingEntry(entry)
    setEditOpen(true)
  }

  function handleView(entry: MediaEntry) {
    setDetailEntryId(entry.id ?? null)
    setDetailOpen(true)
  }

  function handleEditFromDetails(entry: MediaEntry) {
    setReturnToDetailId(entry.id ?? null)
    setDetailOpen(false)
    handleEdit(entry)
  }

  async function handleDelete(id: string, skipConfirm = false) {
    if (!skipConfirm && !confirm('Delete this entry? This cannot be undone.')) return
    setDeletingId(id)
    try {
      await removeEntry(id)
      toast.success('Entry deleted')
    } catch {
      toast.error('Failed to delete entry')
    } finally {
      setDeletingId(null)
    }
  }

  return (
    <AppLayout title="My List" subtitle={`${entries.length} total titles`}>
      <Tabs
        value={activeTab}
        onValueChange={(v) => {
          setActiveTab(v as 'all' | 'movie' | 'series')
          resetPagination()
        }}
      >
        <TabsList className="w-full mb-4">
          <TabsTrigger value="all" className="flex-1 min-w-0 gap-1 sm:gap-2 text-[11px] sm:text-sm px-2 sm:px-4">
            <List className="w-3 h-3 sm:w-3.5 sm:h-3.5 flex-shrink-0" />
            <span>All</span>
            <Badge variant="secondary" className="ml-0.5 sm:ml-1 px-1 sm:px-1.5 text-[10px] sm:text-xs tabular-nums flex-shrink-0">{entries.length}</Badge>
          </TabsTrigger>
          <TabsTrigger value="movie" className="flex-1 min-w-0 gap-1 sm:gap-2 text-[11px] sm:text-sm px-2 sm:px-4">
            <Film className="w-3 h-3 sm:w-3.5 sm:h-3.5 flex-shrink-0" />
            <span>Movies</span>
            <Badge variant="secondary" className="ml-0.5 sm:ml-1 px-1 sm:px-1.5 text-[10px] sm:text-xs tabular-nums flex-shrink-0">{movieCount}</Badge>
          </TabsTrigger>
          <TabsTrigger value="series" className="flex-1 min-w-0 gap-1 sm:gap-2 text-[11px] sm:text-sm px-2 sm:px-4">
            <Tv className="w-3 h-3 sm:w-3.5 sm:h-3.5 flex-shrink-0" />
            <span>Series</span>
            <Badge variant="secondary" className="ml-0.5 sm:ml-1 px-1 sm:px-1.5 text-[10px] sm:text-xs tabular-nums flex-shrink-0">{seriesCount}</Badge>
          </TabsTrigger>
        </TabsList>

        {/* Filters — shared across all tabs */}
        <div className="mb-4">
          {watchHistoryEntries && watchHistoryYear != null && (
            <div className="mb-3 rounded-xl border border-emerald-500/20 bg-emerald-500/10 px-3 py-2 flex items-center justify-between gap-3">
              <div className="min-w-0">
                <p className="text-xs font-semibold text-emerald-300">
                  Watch History: {watchHistoryYear} ({watchHistoryEntries.length} title{watchHistoryEntries.length === 1 ? '' : 's'})
                </p>
                <p className="text-[11px] text-white/45 mt-0.5">
                  Uses Date Finished when available and Year Made as fallback. Sorted by Highest Rated.
                </p>
              </div>
              <Button
                variant="ghost"
                size="sm"
                className="h-7 text-xs flex-shrink-0"
                onClick={() => {
                  resetFilters()
                  setActiveTab('all')
                  resetPagination()
                  router.replace('/my-list')
                }}
              >
                Clear Filter
              </Button>
            </div>
          )}
          {issueFilteredEntries && (
            <div className="mb-3 rounded-xl border border-blue-500/20 bg-blue-500/10 px-3 py-2 flex items-center justify-between gap-3">
              <div className="min-w-0">
                <p className="text-xs font-semibold text-blue-300 truncate">
                  {filteredLabel || 'Filtered Notification List'}
                </p>
                <p className="text-[11px] text-white/40">
                  Showing {issueFilteredEntries.length} affected title{issueFilteredEntries.length === 1 ? '' : 's'}
                </p>
              </div>
              <Button
                variant="ghost"
                size="sm"
                className="h-7 text-xs flex-shrink-0"
                onClick={() => {
                  resetPagination()
                  router.replace('/my-list')
                }}
              >
                Clear
              </Button>
            </div>
          )}
          {!watchHistoryEntries && (
            <FilterBar
              entries={entries}
              viewMode={viewMode}
              onViewModeChange={handleViewModeChange}
            />
          )}
        </div>

        <div ref={listTopRef} />

        {loading ? (
          <div className="flex items-center justify-center py-16">
            <LoadingSpinner size="lg" text="Loading your list..." />
          </div>
        ) : (
          <>
            <TabsContent value="all">
              <MediaList
                entries={paginatedEntries}
                viewMode={viewMode}
                emptyLabel="titles"
                totalCount={tabEntries.length}
                allCount={baseEntries.length}
                onView={handleView}
                onEdit={handleEdit}
                onDelete={handleDelete}
              />
            </TabsContent>
            <TabsContent value="movie">
              <MediaList
                entries={paginatedEntries.filter((e) => getEffectiveMediaType(e) === 'movie')}
                viewMode={viewMode}
                emptyLabel="movies"
                totalCount={tabEntries.filter((e) => getEffectiveMediaType(e) === 'movie').length}
                allCount={baseEntries.filter((e) => getEffectiveMediaType(e) === 'movie').length}
                onView={handleView}
                onEdit={handleEdit}
                onDelete={handleDelete}
              />
            </TabsContent>
            <TabsContent value="series">
              <MediaList
                entries={paginatedEntries.filter((e) => getEffectiveMediaType(e) === 'series')}
                viewMode={viewMode}
                emptyLabel="series"
                totalCount={tabEntries.filter((e) => getEffectiveMediaType(e) === 'series').length}
                allCount={baseEntries.filter((e) => getEffectiveMediaType(e) === 'series').length}
                onView={handleView}
                onEdit={handleEdit}
                onDelete={handleDelete}
              />
            </TabsContent>
          </>
        )}

        {!loading && totalPages > 1 && (
          <PaginationControls
            currentPage={safePage}
            totalPages={totalPages}
            visiblePages={visiblePages}
            groupStart={safeGroupStart}
            lastGroupStart={lastGroupStart}
            onFirstGroup={() => setPageGroupStart(1)}
            onPrevGroup={() => setPageGroupStart((current) => Math.max(1, current - pageGroupSize))}
            onNextGroup={() => setPageGroupStart((current) => Math.min(lastGroupStart, current + pageGroupSize))}
            onLastGroup={() => setPageGroupStart(lastGroupStart)}
            onSelectPage={selectPage}
          />
        )}
      </Tabs>

      <EditEntryModal
        entry={editingEntry}
        open={editOpen}
        onOpenChange={(open) => {
          setEditOpen(open)
          if (!open && returnToDetailId) {
            setDetailEntryId(returnToDetailId)
            setDetailOpen(true)
            setReturnToDetailId(null)
          }
          // When the modal closes, clear the ref so the same ?entry=<id>
          // can be re-opened if the user navigates back to it.
          if (!open) openedEntryIdRef.current = null
        }}
      />
      <TitleDetailsModal
        entry={entries.find((entry) => entry.id === detailEntryId) ?? null}
        entries={entries}
        open={detailOpen}
        onOpenChange={(open) => {
          setDetailOpen(open)
          if (!open) {
            setDetailEntryId(null)
            openedEntryIdRef.current = null
          }
        }}
        onEdit={handleEditFromDetails}
        onDelete={(id) => handleDelete(id, true)}
      />
    </AppLayout>
  )
}

function MediaList({
  entries,
  viewMode,
  emptyLabel,
  totalCount,
  allCount,
  onView,
  onEdit,
  onDelete,
}: {
  entries: MediaEntry[]
  viewMode: 'grid' | 'list'
  emptyLabel: string
  totalCount: number
  allCount: number
  onView: (entry: MediaEntry) => void
  onEdit: (entry: MediaEntry) => void
  onDelete: (id: string) => void
}) {
  if (totalCount === 0) {
    return (
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        className="flex flex-col items-center justify-center py-16 text-center"
      >
        <div className="w-16 h-16 rounded-2xl bg-white/5 border border-white/10 flex items-center justify-center mb-4">
          <List className="w-8 h-8 text-white/20" />
        </div>
        <p className="text-white/50 font-medium">No {emptyLabel} found</p>
        <p className="text-sm text-white/30 mt-1">
          {allCount === 0
            ? `Add some ${emptyLabel} to your list to get started`
            : 'Try adjusting your filters'}
        </p>
      </motion.div>
    )
  }

  return (
    <div className={viewMode === 'grid' ? 'grid grid-cols-2 gap-2.5 sm:gap-3' : 'space-y-2'}>
      {totalCount > entries.length && (
        <p className={viewMode === 'grid' ? 'col-span-2 text-xs text-white/30 text-center mb-1' : 'text-xs text-white/30 text-center mb-2'}>
          Showing {entries.length} of {totalCount}
        </p>
      )}
      <AnimatePresence>
        {entries.map((entry, index) => (
          viewMode === 'grid' ? (
            <InfoGridCard
              key={entry.id}
              entry={entry}
              index={index}
              onView={onView}
              onEdit={onEdit}
              onDelete={onDelete}
            />
          ) : (
            <MediaCard
              key={entry.id}
              entry={entry}
              index={index}
              onView={onView}
              onEdit={onEdit}
              onDelete={onDelete}
            />
          )
        ))}
      </AnimatePresence>
    </div>
  )
}

function PaginationControls({
  currentPage,
  totalPages,
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
    <nav
      className="mt-4 flex items-center justify-center gap-1.5 flex-wrap"
      aria-label={`Pagination, ${totalPages} pages`}
    >
      <PageButton label="«" disabled={atFirstGroup} onClick={onFirstGroup} ariaLabel="Show first page group" />
      <PageButton label="<" disabled={atFirstGroup} onClick={onPrevGroup} ariaLabel="Show previous page group" />
      {visiblePages.map((pageNumber) => (
        <PageButton
          key={pageNumber}
          label={String(pageNumber)}
          active={pageNumber === currentPage}
          onClick={() => onSelectPage(pageNumber)}
          ariaLabel={`Open page ${pageNumber}`}
        />
      ))}
      <PageButton label=">" disabled={atLastGroup} onClick={onNextGroup} ariaLabel="Show next page group" />
      <PageButton label="»" disabled={atLastGroup} onClick={onLastGroup} ariaLabel="Show last page group" />
    </nav>
  )
}

function PageButton({
  label,
  active = false,
  disabled = false,
  onClick,
  ariaLabel,
}: {
  label: string
  active?: boolean
  disabled?: boolean
  onClick: () => void
  ariaLabel: string
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={ariaLabel}
      aria-current={active ? 'page' : undefined}
      className={[
        'min-w-9 h-9 px-2 rounded-lg border text-sm font-semibold transition-colors',
        active
          ? 'bg-blue-600/25 border-blue-500/50 text-blue-200'
          : 'bg-white/5 border-white/10 text-white/55 hover:bg-white/10 hover:text-white',
        disabled ? 'opacity-35 cursor-not-allowed hover:bg-white/5 hover:text-white/55' : '',
      ].join(' ')}
    >
      {label}
    </button>
  )
}
