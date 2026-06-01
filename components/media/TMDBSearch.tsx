'use client'

import { useState, useRef, useEffect } from 'react'
import Image from 'next/image'
import { Search, Film, Tv, Loader2, X } from 'lucide-react'
import { motion, AnimatePresence } from 'framer-motion'
import { Input } from '@/components/ui/input'
import { useTMDBSearch } from '@/hooks/useTMDB'
import { NormalizedTMDBResult } from '@/types/tmdb'
import { MediaType } from '@/types/media'

interface TMDBSearchProps {
  mediaType?: MediaType | 'all'
  onSelect: (result: NormalizedTMDBResult) => void
  placeholder?: string
  /** Pre-seed the search bar with this query on mount (use key= to reset). */
  defaultQuery?: string
}

export function TMDBSearch({ mediaType = 'all', onSelect, placeholder, defaultQuery }: TMDBSearchProps) {
  const [query, setQuery] = useState(defaultQuery ?? '')
  const [open, setOpen] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)
  const { results, loading, search, clearResults } = useTMDBSearch(mediaType)

  useEffect(() => {
    search(query)
    setOpen(query.length >= 2)
  }, [query, search])

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  function handleSelect(result: NormalizedTMDBResult) {
    onSelect(result)
    setQuery('')
    setOpen(false)
    clearResults()
  }

  function handleClear() {
    setQuery('')
    setOpen(false)
    clearResults()
  }

  return (
    <div ref={containerRef} className="relative">
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-white/30" />
        <Input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={placeholder || 'Search TMDB for movies or series...'}
          className="pl-10 pr-10"
          onFocus={() => query.length >= 2 && setOpen(true)}
        />
        {loading ? (
          <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-white/30 animate-spin" />
        ) : query ? (
          <button
            onClick={handleClear}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-white/30 hover:text-white/60"
          >
            <X className="w-4 h-4" />
          </button>
        ) : null}
      </div>

      <AnimatePresence>
        {open && results.length > 0 && (
          <motion.div
            initial={{ opacity: 0, y: -4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -4 }}
            transition={{ duration: 0.15 }}
            className="absolute top-full left-0 right-0 mt-1 z-50 bg-[#0D0D1A] border border-white/10 rounded-xl shadow-2xl overflow-hidden max-h-80 overflow-y-auto"
          >
            {results.map((result) => {
              const Icon = result.type === 'movie' ? Film : Tv
              return (
                <button
                  key={`${result.type}-${result.tmdbId}`}
                  onClick={() => handleSelect(result)}
                  className="w-full flex items-center gap-3 px-3 py-2.5 hover:bg-white/5 transition-colors text-left"
                >
                  <div className="w-8 h-12 flex-shrink-0 rounded overflow-hidden bg-white/5 border border-white/10">
                    {result.posterUrl ? (
                      <Image
                        src={result.posterUrl}
                        alt={result.title}
                        width={32}
                        height={48}
                        className="w-full h-full object-cover"
                      />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center">
                        <Icon className="w-4 h-4 text-white/20" />
                      </div>
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-white truncate">{result.title}</p>
                    <div className="flex items-center gap-2 mt-0.5">
                      <span className="text-xs text-white/40">{result.year || '—'}</span>
                      <span className="flex items-center gap-0.5 text-xs text-white/30">
                        <Icon className="w-3 h-3" />
                        {result.type}
                      </span>
                      {result.country && (
                        <span className="text-xs text-white/30">{result.country}</span>
                      )}
                    </div>
                  </div>
                  <span className="text-xs text-blue-400/60 flex-shrink-0">Select</span>
                </button>
              )
            })}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
