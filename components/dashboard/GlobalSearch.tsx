'use client'

import { useMemo, useRef, useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import Image from 'next/image'
import { Search, Film, Tv, X, Loader2, Plus, Check } from 'lucide-react'
import { MediaEntry } from '@/types/media'
import { getDisplayTitle, getEffectiveMediaType, getDisplayPosterUrl } from '@/utils/formatters'
import { useTMDBSearch } from '@/hooks/useTMDB'
import { NormalizedTMDBResult } from '@/types/tmdb'

interface GlobalSearchProps {
  entries: MediaEntry[]
}

export function GlobalSearch({ entries }: GlobalSearchProps) {
  const router = useRouter()
  const [query, setQuery] = useState('')
  const [open, setOpen] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)

  const {
    results: tmdbResults,
    loading: tmdbLoading,
    search: searchTMDB,
    clearResults: clearTMDB,
  } = useTMDBSearch('all')

  // ── Library search (instant, client-side) ──────────────────────────────────
  // Searches title, nativeTitle (for non-Latin scripts), country, and genres.
  const libraryResults = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (q.length < 1) return []
    return entries
      .filter((e) => {
        const title       = e.title.toLowerCase()
        const nativeTitle = e.nativeTitle?.toLowerCase() ?? ''
        const country     = e.country?.toLowerCase() ?? ''
        const genres      = e.genres?.join(' ').toLowerCase() ?? ''
        return title.includes(q) || nativeTitle.includes(q) || country.includes(q) || genres.includes(q)
      })
      .slice(0, 5)
  }, [query, entries])

  // ── TMDB search (debounced, async) ─────────────────────────────────────────
  useEffect(() => {
    if (query.trim().length >= 2) {
      searchTMDB(query)
    } else {
      clearTMDB()
    }
  }, [query, searchTMDB, clearTMDB])

  // TMDB results not already in the user's library (matched by tmdbId)
  const tmdbOnlyResults = useMemo(() => {
    const libraryTmdbIds = new Set(entries.map((e) => e.tmdbId).filter(Boolean))
    return tmdbResults
      .filter((r) => !libraryTmdbIds.has(r.tmdbId))
      .slice(0, 5)
  }, [tmdbResults, entries])

  // ── Click-outside handler ──────────────────────────────────────────────────
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  function handleSelectLibrary(entry: MediaEntry) {
    setOpen(false)
    setQuery('')
    clearTMDB()
    router.push(`/my-list?entry=${entry.id}`)
  }

  /** Navigate to Add Entry with TMDB data pre-filled via URL params. */
  function handleAddToLibrary(result: NormalizedTMDBResult) {
    setOpen(false)
    setQuery('')
    clearTMDB()
    router.push(`/add-entry?tmdbId=${result.tmdbId}&tmdbType=${result.type}`)
  }

  const hasResults    = libraryResults.length > 0 || tmdbOnlyResults.length > 0
  const showDropdown  = open && query.trim().length >= 1

  return (
    <div ref={containerRef} className="relative flex-1">
      <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-white/30 pointer-events-none" />
      <input
        type="text"
        value={query}
        onChange={(e) => { setQuery(e.target.value); setOpen(true) }}
        onFocus={() => setOpen(true)}
        placeholder="Search your library or TMDB..."
        className="w-full h-10 pl-10 pr-9 rounded-xl bg-white/5 border border-white/10 text-sm text-white placeholder:text-white/30 focus:outline-none focus:border-blue-500/40 focus:bg-white/[0.07] transition-colors"
      />
      {query && (
        <button
          type="button"
          onClick={() => { setQuery(''); setOpen(false); clearTMDB() }}
          className="absolute right-3 top-1/2 -translate-y-1/2 text-white/30 hover:text-white/60"
        >
          <X className="w-4 h-4" />
        </button>
      )}

      {showDropdown && (
        <div className="absolute z-50 mt-2 w-full rounded-xl border border-white/10 bg-[#0D0D1A] shadow-2xl overflow-hidden max-h-[480px] overflow-y-auto">

          {/* ── Library results ─────────────────────────────────────────── */}
          {libraryResults.length > 0 && (
            <>
              <div className="px-3 pt-2 pb-1">
                <span className="text-[10px] font-semibold text-white/30 uppercase tracking-wider">
                  In Your Library
                </span>
              </div>
              {libraryResults.map((entry) => {
                const type = getEffectiveMediaType(entry)
                const Icon = type === 'series' ? Tv : Film
                return (
                  <button
                    key={entry.id}
                    type="button"
                    onClick={() => handleSelectLibrary(entry)}
                    className="w-full flex items-center gap-3 px-3 py-2 hover:bg-white/5 transition-colors text-left"
                  >
                    <div className="w-8 h-11 rounded overflow-hidden bg-white/10 flex items-center justify-center flex-shrink-0">
                      {getDisplayPosterUrl(entry) ? (
                        <Image
                          src={getDisplayPosterUrl(entry)!}
                          alt={entry.title}
                          width={32}
                          height={44}
                          className="object-cover w-full h-full"
                          unoptimized
                        />
                      ) : (
                        <Icon className="w-4 h-4 text-white/30" />
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-white truncate">
                        {getDisplayTitle(entry)}
                      </p>
                      <p className="text-xs text-white/40">
                        {type === 'series' ? 'Series' : 'Movie'}
                        {entry.yearMade ? ` · ${entry.yearMade}` : ''}
                        {entry.country  ? ` · ${entry.country}`  : ''}
                      </p>
                    </div>
                    <span className="flex items-center gap-1 text-[10px] font-medium text-emerald-400/80 bg-emerald-400/10 border border-emerald-400/20 rounded-full px-1.5 py-0.5 flex-shrink-0">
                      <Check className="w-2.5 h-2.5" />
                      Listed
                    </span>
                  </button>
                )
              })}
            </>
          )}

          {/* ── TMDB loading indicator ──────────────────────────────────── */}
          {tmdbLoading && query.trim().length >= 2 && (
            <div className="px-3 py-2 flex items-center gap-2 border-t border-white/5">
              <Loader2 className="w-3 h-3 animate-spin text-white/30" />
              <span className="text-xs text-white/30">Searching TMDB…</span>
            </div>
          )}

          {/* ── TMDB-only results ───────────────────────────────────────── */}
          {tmdbOnlyResults.length > 0 && (
            <>
              <div className={`px-3 pb-1 ${libraryResults.length > 0 ? 'pt-1 border-t border-white/5' : 'pt-2'}`}>
                <span className="text-[10px] font-semibold text-white/30 uppercase tracking-wider">
                  On TMDB — Not in Library
                </span>
              </div>
              {tmdbOnlyResults.map((result) => {
                const Icon = result.type === 'series' ? Tv : Film
                return (
                  <div
                    key={`${result.type}-${result.tmdbId}`}
                    className="flex items-center gap-3 px-3 py-2 hover:bg-white/5 transition-colors"
                  >
                    <div className="w-8 h-11 rounded overflow-hidden bg-white/10 flex items-center justify-center flex-shrink-0">
                      {result.posterUrl ? (
                        <Image
                          src={result.posterUrl}
                          alt={result.title}
                          width={32}
                          height={44}
                          className="object-cover w-full h-full"
                          unoptimized
                        />
                      ) : (
                        <Icon className="w-4 h-4 text-white/30" />
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-white truncate">{result.title}</p>
                      <p className="text-xs text-white/40">
                        {result.type === 'series' ? 'Series' : 'Movie'}
                        {result.year    ? ` · ${result.year}`    : ''}
                        {result.country ? ` · ${result.country}` : ''}
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => handleAddToLibrary(result)}
                      className="flex items-center gap-1 text-[10px] font-medium text-blue-400 bg-blue-400/10 border border-blue-400/20 rounded-full px-2 py-0.5 flex-shrink-0 hover:bg-blue-400/20 transition-colors"
                    >
                      <Plus className="w-2.5 h-2.5" />
                      Add
                    </button>
                  </div>
                )
              })}
            </>
          )}

          {/* ── Empty state ─────────────────────────────────────────────── */}
          {!hasResults && !tmdbLoading && (
            <p className="px-4 py-3 text-sm text-white/40">No titles found</p>
          )}
        </div>
      )}
    </div>
  )
}
