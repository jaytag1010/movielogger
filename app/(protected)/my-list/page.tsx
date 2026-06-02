'use client'

export const dynamic = 'force-dynamic'

import { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { toast } from 'sonner'
import { AppLayout } from '@/components/layout/AppLayout'
import { MediaCard } from '@/components/media/MediaCard'
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
import { Film, Tv, List } from 'lucide-react'

const ITEMS_PER_PAGE = 20

export default function MyListPage() {
  const { entries, filteredEntries, loading, removeEntry } = useMedia()
  const { activeTab, setActiveTab } = useMediaStore()
  const [editingEntry, setEditingEntry] = useState<MediaEntry | null>(null)
  const [editOpen, setEditOpen] = useState(false)
  const [page, setPage] = useState(1)
  const [deletingId, setDeletingId] = useState<string | null>(null)

  const movieCount = entries.filter((e) => getEffectiveMediaType(e) === 'movie').length
  const seriesCount = entries.filter((e) => getEffectiveMediaType(e) === 'series').length

  // For "All" tab, show all filteredEntries; otherwise filter by effective type
  const tabEntries =
    activeTab === 'all'
      ? filteredEntries
      : filteredEntries.filter((e) => getEffectiveMediaType(e) === activeTab)

  const paginatedEntries = tabEntries.slice(0, page * ITEMS_PER_PAGE)
  const hasMore = tabEntries.length > page * ITEMS_PER_PAGE

  function handleEdit(entry: MediaEntry) {
    setEditingEntry(entry)
    setEditOpen(true)
  }

  async function handleDelete(id: string) {
    if (!confirm('Delete this entry? This cannot be undone.')) return
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
          setPage(1)
        }}
      >
        <TabsList className="w-full mb-4">
          <TabsTrigger value="all" className="flex-1 gap-2">
            <List className="w-3.5 h-3.5" />
            All
            <Badge variant="secondary" className="ml-1">{entries.length}</Badge>
          </TabsTrigger>
          <TabsTrigger value="movie" className="flex-1 gap-2">
            <Film className="w-3.5 h-3.5" />
            Movies
            <Badge variant="secondary" className="ml-1">{movieCount}</Badge>
          </TabsTrigger>
          <TabsTrigger value="series" className="flex-1 gap-2">
            <Tv className="w-3.5 h-3.5" />
            Series
            <Badge variant="secondary" className="ml-1">{seriesCount}</Badge>
          </TabsTrigger>
        </TabsList>

        {/* Filters — shared across all tabs */}
        <div className="mb-4">
          <FilterBar entries={entries} />
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-16">
            <LoadingSpinner size="lg" text="Loading your list..." />
          </div>
        ) : (
          <>
            <TabsContent value="all">
              <MediaList
                entries={paginatedEntries}
                emptyLabel="titles"
                totalCount={tabEntries.length}
                allCount={filteredEntries.length}
                onEdit={handleEdit}
                onDelete={handleDelete}
              />
            </TabsContent>
            <TabsContent value="movie">
              <MediaList
                entries={paginatedEntries.filter((e) => getEffectiveMediaType(e) === 'movie')}
                emptyLabel="movies"
                totalCount={tabEntries.filter((e) => getEffectiveMediaType(e) === 'movie').length}
                allCount={filteredEntries.filter((e) => getEffectiveMediaType(e) === 'movie').length}
                onEdit={handleEdit}
                onDelete={handleDelete}
              />
            </TabsContent>
            <TabsContent value="series">
              <MediaList
                entries={paginatedEntries.filter((e) => getEffectiveMediaType(e) === 'series')}
                emptyLabel="series"
                totalCount={tabEntries.filter((e) => getEffectiveMediaType(e) === 'series').length}
                allCount={filteredEntries.filter((e) => getEffectiveMediaType(e) === 'series').length}
                onEdit={handleEdit}
                onDelete={handleDelete}
              />
            </TabsContent>
          </>
        )}

        {hasMore && !loading && (
          <div className="text-center mt-4">
            <Button variant="outline" onClick={() => setPage((p) => p + 1)}>
              Load More ({tabEntries.length - paginatedEntries.length} remaining)
            </Button>
          </div>
        )}
      </Tabs>

      <EditEntryModal
        entry={editingEntry}
        open={editOpen}
        onOpenChange={setEditOpen}
      />
    </AppLayout>
  )
}

function MediaList({
  entries,
  emptyLabel,
  totalCount,
  allCount,
  onEdit,
  onDelete,
}: {
  entries: MediaEntry[]
  emptyLabel: string
  totalCount: number
  allCount: number
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
    <div className="space-y-2">
      {totalCount > entries.length && (
        <p className="text-xs text-white/30 text-center mb-2">
          Showing {entries.length} of {totalCount}
        </p>
      )}
      <AnimatePresence>
        {entries.map((entry, index) => (
          <MediaCard
            key={entry.id}
            entry={entry}
            index={index}
            onEdit={onEdit}
            onDelete={onDelete}
          />
        ))}
      </AnimatePresence>
    </div>
  )
}
