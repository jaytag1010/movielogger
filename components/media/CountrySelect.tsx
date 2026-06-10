'use client'

import { useMemo } from 'react'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  SelectGroup,
  SelectLabel,
  SelectSeparator,
} from '@/components/ui/select'
import { FEATURED_COUNTRIES, ALL_COUNTRIES_SORTED, normalizeCountry } from '@/utils/countries'
import { MediaEntry } from '@/types/media'

interface CountrySelectProps {
  value: string | null | undefined
  onChange: (country: string | null) => void
  /** Existing library entries — used to surface frequently-used countries first */
  libraryEntries?: MediaEntry[]
  placeholder?: string
  className?: string
}

const CLEAR_VALUE = '__clear__'

export function CountrySelect({
  value,
  onChange,
  libraryEntries = [],
  placeholder = 'Select country…',
  className,
}: CountrySelectProps) {
  // Top 8 countries by title count from the user's library
  const libraryCountries = useMemo(() => {
    if (libraryEntries.length === 0) return []
    const counts: Record<string, number> = {}
    for (const entry of libraryEntries) {
      const c = normalizeCountry(entry.country)
      if (c) counts[c] = (counts[c] || 0) + 1
    }
    return Object.entries(counts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 8)
      .map(([name]) => name)
  }, [libraryEntries])

  // Use library-based top 8 when available; fall back to defaults for new/empty libraries
  const hasLibraryData = libraryCountries.length > 0
  const featuredSection = hasLibraryData ? libraryCountries : FEATURED_COUNTRIES

  // Remaining countries: all sorted, minus featured
  const featuredSet = new Set(featuredSection)
  const remainingCountries = ALL_COUNTRIES_SORTED.filter((c) => !featuredSet.has(c))

  // Normalise the current value so it displays correctly
  const displayValue = normalizeCountry(value) ?? undefined

  return (
    <Select
      value={displayValue ?? ''}
      onValueChange={(v) => {
        if (v === CLEAR_VALUE || v === '') {
          onChange(null)
        } else {
          onChange(v)
        }
      }}
    >
      <SelectTrigger className={className}>
        <SelectValue placeholder={placeholder}>
          {displayValue || <span className="text-white/30">{placeholder}</span>}
        </SelectValue>
      </SelectTrigger>
      <SelectContent className="max-h-72">

        {/* Clear option */}
        <SelectItem value={CLEAR_VALUE}>
          <span className="text-white/40 italic">Clear / None</span>
        </SelectItem>

        <SelectSeparator />

        {/* Most-used from library (or featured defaults) */}
        <SelectGroup>
          <SelectLabel className="text-[10px] text-white/30 uppercase tracking-wider px-2 py-1">
            {hasLibraryData ? 'Most in Your Library' : 'Common Countries'}
          </SelectLabel>
          {featuredSection.map((country) => (
            <SelectItem key={country} value={country}>
              {country}
            </SelectItem>
          ))}
        </SelectGroup>

        <SelectSeparator />

        {/* Alphabetical remainder */}
        <SelectGroup>
          <SelectLabel className="text-[10px] text-white/30 uppercase tracking-wider px-2 py-1">
            All Countries
          </SelectLabel>
          {remainingCountries.map((country) => (
            <SelectItem key={country} value={country}>
              {country}
            </SelectItem>
          ))}
        </SelectGroup>

      </SelectContent>
    </Select>
  )
}
