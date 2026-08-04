'use client'

import { useMemo } from 'react'
import { Search, X, LayoutGrid, Table2 } from 'lucide-react'
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectSeparator,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Button } from '@/components/ui/button'
import { MediaEntry, MediaFilters, MediaStatus, MEDIA_STATUS_LABELS } from '@/types/media'
import { useMediaStore } from '@/store/mediaStore'
import { cn } from '@/utils/cn'
import { normalizeCountry } from '@/utils/countries'

interface FilterBarProps {
  entries: MediaEntry[]
  viewMode?: 'card' | 'table'
  onViewModeChange?: (mode: 'card' | 'table') => void
}

export function FilterBar({ entries, viewMode, onViewModeChange }: FilterBarProps) {
  const { filters, setFilters, resetFilters } = useMediaStore()

  const genres = useMemo(() => {
    const set = new Set<string>()
    entries.forEach((e) => e.genres?.forEach((g) => set.add(g)))
    return Array.from(set).sort()
  }, [entries])

  const countryOptions = useMemo(() => {
    const counts: Record<string, number> = {}
    entries.forEach((e) => {
      const country = normalizeCountry(e.country)
      if (country) counts[country] = (counts[country] ?? 0) + 1
    })
    const sortedByName = Object.keys(counts).sort()
    const topCountries = Object.entries(counts)
      .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
      .slice(0, 8)
      .map(([country]) => country)
    const topSet = new Set(topCountries)
    return {
      topCountries,
      remainingCountries: sortedByName.filter((country) => !topSet.has(country)),
      allCountries: sortedByName,
    }
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
    filters.sortBy !== 'dateFinished' ||
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

        {countryOptions.allCountries.length > 0 && (
          <Select
            value={filters.country}
            onValueChange={(v) => setFilters({ country: v })}
          >
            <SelectTrigger className="h-8 text-xs flex-1 min-w-[100px]">
              <SelectValue placeholder="Country" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Countries</SelectItem>
              {countryOptions.topCountries.length > 0 && (
                <>
                  <SelectSeparator />
                  <SelectGroup>
                    <SelectLabel className="text-[10px] text-white/30 uppercase tracking-wider px-2 py-1">
                      Top Country Origins
                    </SelectLabel>
                    {countryOptions.topCountries.map((c) => (
                      <SelectItem key={c} value={c}>{c}</SelectItem>
                    ))}
                  </SelectGroup>
                </>
              )}
              {countryOptions.remainingCountries.length > 0 && (
                <>
                  <SelectSeparator />
                  <SelectGroup>
                    <SelectLabel className="text-[10px] text-white/30 uppercase tracking-wider px-2 py-1">
                      All Countries
                    </SelectLabel>
                    {countryOptions.remainingCountries.map((c) => (
                      <SelectItem key={c} value={c}>{c}</SelectItem>
                    ))}
                  </SelectGroup>
                </>
              )}
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
              <SelectItem value="all">All Age Ratings</SelectItem>
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
            <SelectItem value="dateFinished_desc">Newest First</SelectItem>
            <SelectItem value="dateFinished_asc">Oldest First</SelectItem>
            <SelectItem value="title_asc">Title A–Z</SelectItem>
            <SelectItem value="title_desc">Title Z–A</SelectItem>
            <SelectItem value="rating_desc">Highest Rated</SelectItem>
            <SelectItem value="rating_asc">Lowest Rated</SelectItem>
            <SelectItem value="year_desc">Newest Release</SelectItem>
            <SelectItem value="year_asc">Oldest Release</SelectItem>
            <SelectItem value="createdAt_desc">Date Added ↓</SelectItem>
            <SelectItem value="createdAt_asc">Date Added ↑</SelectItem>
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

        {onViewModeChange && viewMode && (
          <div className="flex items-center rounded-lg border border-white/10 overflow-hidden flex-shrink-0 ml-auto">
            <button
              type="button"
              onClick={() => onViewModeChange('card')}
              title="Card view"
              className={cn(
                'h-8 w-8 flex items-center justify-center transition-colors',
                viewMode === 'card'
                  ? 'bg-white/15 text-white'
                  : 'text-white/40 hover:text-white/70 hover:bg-white/5'
              )}
            >
              <LayoutGrid className="w-3.5 h-3.5" />
            </button>
            <button
              type="button"
              onClick={() => onViewModeChange('table')}
              title="Table view"
              className={cn(
                'h-8 w-8 flex items-center justify-center transition-colors border-l border-white/10',
                viewMode === 'table'
                  ? 'bg-white/15 text-white'
                  : 'text-white/40 hover:text-white/70 hover:bg-white/5'
              )}
            >
              <Table2 className="w-3.5 h-3.5" />
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
