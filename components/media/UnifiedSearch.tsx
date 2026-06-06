'use client'

import { useState, useRef, useEffect } from 'react'
import Image from 'next/image'
import { Search, Film, Tv, Loader2, X } from 'lucide-react'
import { motion, AnimatePresence } from 'framer-motion'
import { Input } from '@/components/ui/input'
import { useUnifiedSearch } from '@/hooks/useUnifiedSearch'
import { NormalizedTMDBResult } from '@/types/tmdb'

interface UnifiedSearchProps {
  onSelect: (result: NormalizedTMDBResult) => void
  placeholder?: string
  /** Pre-seed the search query on mount. Use key= to reset. */
  defaultQuery?: string
}

/**
 * Search bar that queries TMDB and MDL in parallel.
 * Each result shows a source badge ([TMDB] or [MDL]).
 * Drop-in replacement for TMDBSearch in any metadata-link context.
 */
export function UnifiedSearch({ onSelect, placeholder, defaultQuery }: UnifiedSearchProps) {
  const [query, setQuery] = useState(defaultQuery ?? '')
  const [open,  setOpen]  = useState(false)
  const containerRef      = useRef<HTMLDivElement>(null)
  const { results, loading, search, clearResults } = useUnifiedSearch()

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
          placeholder={placeholder || 'Search TMDB & MDL for movies or dramas…'}
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
            {results.map((result, idx) => {
              const Icon    = result.type === 'movie' ? Film : Tv
              const isMDL   = result.source === 'mdl'
              const resultKey = isMDL
                ? `mdl-${result.mdlId ?? idx}`
                : `tmdb-${result.tmdbId}-${idx}`

              return (
                <button
                  key={resultKey}
                  onClick={() => handleSelect(result)}
                  className="w-full flex items-center gap-3 px-3 py-2.5 hover:bg-white/5 transition-colors text-left"
                >
                  {/* Poster thumbnail */}
                  <div className="w-8 h-12 flex-shrink-0 rounded overflow-hidden bg-white/5 border border-white/10">
                    {result.posterUrl ? (
                      <Image
                        src={result.posterUrl}
                        alt={result.title}
                        width={32}
                        height={48}
                        className="w-full h-full object-cover"
                        unoptimized={isMDL} // MDL URLs are direct, skip Next.js optimisation
                      />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center">
                        <Icon className="w-4 h-4 text-white/20" />
                      </div>
                    )}
                  </div>

                  {/* Title + metadata */}
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-white truncate">{result.title}</p>
                    <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                      {/* Media type badge */}
                      <span className={`inline-flex items-center gap-1 text-[10px] font-semibold rounded-full px-1.5 py-0.5 border ${
                        result.type === 'movie'
                          ? 'bg-purple-500/15 text-purple-300 border-purple-500/25'
                          : 'bg-blue-500/15 text-blue-300 border-blue-500/25'
                      }`}>
                        <Icon className="w-2.5 h-2.5" />
                        {result.type === 'movie' ? 'Movie' : 'Series'}
                      </span>
                      {result.year && (
                        <span className="text-xs text-white/40">{result.year}</span>
                      )}
                      {result.country && (
                        <span className="text-xs text-white/30">{result.country}</span>
                      )}
                    </div>
                  </div>

                  {/* Source badge */}
                  <span className={`text-[10px] font-semibold flex-shrink-0 px-1.5 py-0.5 rounded-full border ${
                    isMDL
                      ? 'bg-amber-500/15 text-amber-300 border-amber-500/25'
                      : 'bg-blue-500/15 text-blue-300 border-blue-500/25'
                  }`}>
                    {isMDL ? 'MDL' : 'TMDB'}
                  </span>
                </button>
              )
            })}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
