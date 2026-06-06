'use client'

import { useMemo, useRef, useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import Image from 'next/image'
import { Search, Film, Tv, X } from 'lucide-react'
import { MediaEntry } from '@/types/media'
import { getDisplayTitle, getEffectiveMediaType, getDisplayPosterUrl } from '@/utils/formatters'

interface GlobalSearchProps {
  entries: MediaEntry[]
}

export function GlobalSearch({ entries }: GlobalSearchProps) {
  const router = useRouter()
  const [query, setQuery] = useState('')
  const [open, setOpen] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)

  const results = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (q.length < 1) return []
    return entries
      .filter((e) => {
        const title = e.title.toLowerCase()
        const country = e.country?.toLowerCase() ?? ''
        const genres = e.genres?.join(' ').toLowerCase() ?? ''
        return title.includes(q) || country.includes(q) || genres.includes(q)
      })
      .slice(0, 8)
  }, [query, entries])

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  function handleSelect(entry: MediaEntry) {
    setOpen(false)
    setQuery('')
    router.push(`/my-list?entry=${entry.id}`)
  }

  return (
    <div ref={containerRef} className="relative flex-1">
      <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-white/30 pointer-events-none" />
      <input
        type="text"
        value={query}
        onChange={(e) => { setQuery(e.target.value); setOpen(true) }}
        onFocus={() => setOpen(true)}
        placeholder="Search all titles..."
        className="w-full h-10 pl-10 pr-9 rounded-xl bg-white/5 border border-white/10 text-sm text-white placeholder:text-white/30 focus:outline-none focus:border-blue-500/40 focus:bg-white/[0.07] transition-colors"
      />
      {query && (
        <button
          type="button"
          onClick={() => { setQuery(''); setOpen(false) }}
          className="absolute right-3 top-1/2 -translate-y-1/2 text-white/30 hover:text-white/60"
        >
          <X className="w-4 h-4" />
        </button>
      )}

      {open && query.trim().length >= 1 && (
        <div className="absolute z-50 mt-2 w-full rounded-xl border border-white/10 bg-[#0D0D1A] shadow-2xl overflow-hidden max-h-80 overflow-y-auto">
          {results.length === 0 ? (
            <p className="px-4 py-3 text-sm text-white/40">No titles found</p>
          ) : (
            results.map((entry) => {
              const type = getEffectiveMediaType(entry)
              return (
                <button
                  key={entry.id}
                  type="button"
                  onClick={() => handleSelect(entry)}
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
                    ) : type === 'series' ? (
                      <Tv className="w-4 h-4 text-white/30" />
                    ) : (
                      <Film className="w-4 h-4 text-white/30" />
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-white truncate">{getDisplayTitle(entry)}</p>
                    <p className="text-xs text-white/40">
                      {type === 'series' ? 'Series' : 'Movie'}
                      {entry.yearMade ? ` · ${entry.yearMade}` : ''}
                      {entry.country ? ` · ${entry.country}` : ''}
                    </p>
                  </div>
                </button>
              )
            })
          )}
        </div>
      )}
    </div>
  )
}
