'use client'

import { useMemo } from 'react'
import { Search, X } from 'lucide-react'
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Button } from '@/components/ui/button'
import { MediaEntry, MediaFilters, MediaStatus, MEDIA_STATUS_LABELS } from '@/types/media'
import { useMediaStore } from '@/store/mediaStore'

interface FilterBarProps {
  entries: MediaEntry[]
}

export function FilterBar({ entries }: FilterBarProps) {
  const { filters, setFilters, resetFilters } = useMediaStore()

  const genres = useMemo(() => {
    const set = new Set<string>()
    entries.forEach((e) => e.genres?.forEach((g) => set.add(g)))
    return Array.from(set).sort()
  }, [entries])

  const countries = useMemo(() => {
    const set = new Set<string>()
    entries.forEach((e) => { if (e.country) set.add(e.country) })
    return Array.from(set).sort()
  }, [entries])

  const years = useMemo(() => {
    const set = new Set<number>()
    entries.forEach((e) => { if (e.yearMade) set.add(e.yearMade) })
    return Array.from(set).sort((a, b) => b - a) // newest first
  }, [entries])

  const ageRatings = useMemo(() => {
    const set = new Set<string>()
    entries.forEach((e) => { if (e.ageRating) set.add(e.ageRating) })
    return Array.from(set).sort()
  }, [entries])

  const hasActiveFilters =
    filters.search ||
    filters.status !== 'all' ||
    filters.genre !== 'all' ||
    filters.country !== 'all' ||
    filters.year !== 'all' ||
    filters.ageRating !== 'all' ||
    filters.sortBy !== 'createdAt' ||
    filters.sortOrder !== 'desc'

  return (
    <div className="space-y-2">
      {/* Search */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-white/30" />
        <Input
          placeholder="Search titles, genres, countries..."
          value={filters.search}
          onChange={(e) => setFilters({ search: e.target.value })}
          className="pl-10 pr-10"
        />
        {filters.search && (
          <button
            onClick={() => setFilters({ search: '' })}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-white/30 hover:text-white/60"
          >
            <X className="w-4 h-4" />
          </button>
        )}
      </div>

      {/* Filter row 1 */}
      <div className="flex gap-2 flex-wrap">
        <Select
          value={filters.status}
          onValueChange={(v) => setFilters({ status: v as MediaStatus | 'all' })}
        >
          <SelectTrigger className="h-8 text-xs flex-1 min-w-[100px]">
            <SelectValue placeholder="Status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Statuses</SelectItem>
            {Object.entries(MEDIA_STATUS_LABELS).map(([value, label]) => (
              <SelectItem key={value} value={value}>{label}</SelectItem>
            ))}
          </SelectContent>
        </Select>

        {genres.length > 0 && (
          <Select
            value={filters.genre}
            onValueChange={(v) => setFilters({ genre: v })}
          >
            <SelectTrigger className="h-8 text-xs flex-1 min-w-[100px]">
              <SelectValue placeholder="Genre" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Genres</SelectItem>
              {genres.map((g) => (
                <SelectItem key={g} value={g}>{g}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}

        {countries.length > 0 && (
          <Select
            value={filters.country}
            onValueChange={(v) => setFilters({ country: v })}
          >
            <SelectTrigger className="h-8 text-xs flex-1 min-w-[100px]">
              <SelectValue placeholder="Country" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Countries</SelectItem>
              {countries.map((c) => (
                <SelectItem key={c} value={c}>{c}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
      </div>

      {/* Filter row 2 */}
      <div className="flex gap-2 flex-wrap">
        {years.length > 0 && (
          <Select
            value={filters.year}
            onValueChange={(v) => setFilters({ year: v })}
          >
            <SelectTrigger className="h-8 text-xs flex-1 min-w-[90px]">
              <SelectValue placeholder="Year" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Years</SelectItem>
              {years.map((y) => (
                <SelectItem key={y} value={String(y)}>{y}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}

        {ageRatings.length > 0 && (
          <Select
            value={filters.ageRating}
            onValueChange={(v) => setFilters({ ageRating: v })}
          >
            <SelectTrigger className="h-8 text-xs flex-1 min-w-[100px]">
              <SelectValue placeholder="Age Rating" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Ratings</SelectItem>
              {ageRatings.map((r) => (
                <SelectItem key={r} value={r}>{r}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}

        <Select
          value={`${filters.sortBy}_${filters.sortOrder}`}
          onValueChange={(v) => {
            const [sortBy, sortOrder] = v.split('_')
            setFilters({
              sortBy: sortBy as MediaFilters['sortBy'],
              sortOrder: sortOrder as 'asc' | 'desc',
            })
          }}
        >
          <SelectTrigger className="h-8 text-xs flex-1 min-w-[120px]">
            <SelectValue placeholder="Sort by" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="createdAt_desc">Newest First</SelectItem>
            <SelectItem value="createdAt_asc">Oldest First</SelectItem>
            <SelectItem value="title_asc">Title A–Z</SelectItem>
            <SelectItem value="title_desc">Title Z–A</SelectItem>
            <SelectItem value="rating_desc">Highest Rated</SelectItem>
            <SelectItem value="rating_asc">Lowest Rated</SelectItem>
            <SelectItem value="year_desc">Newest Release</SelectItem>
            <SelectItem value="year_asc">Oldest Release</SelectItem>
          </SelectContent>
        </Select>

        {hasActiveFilters && (
          <Button
            variant="ghost"
            size="sm"
            onClick={resetFilters}
            className="h-8 text-xs text-red-400 hover:text-red-300 px-2"
          >
            <X className="w-3.5 h-3.5 mr-1" />
            Clear
          </Button>
        )}
      </div>
    </div>
  )
}
