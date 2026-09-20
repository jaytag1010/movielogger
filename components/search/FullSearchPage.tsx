'use client'

import { useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Clapperboard, Film, Loader2, Search, Tv, UserRound } from 'lucide-react'
import { AppLayout } from '@/components/layout/AppLayout'
import { TMDBPosterImage } from '@/components/common/TMDBPosterImage'
import { useMedia } from '@/hooks/useMedia'
import { useTMDBSearch } from '@/hooks/useTMDB'
import { searchPublicProfiles } from '@/lib/firebase/publicSharing'
import type { PublicProfileDocument } from '@/types/public'
import type { MediaEntry, MediaType } from '@/types/media'
import type { NormalizedTMDBResult } from '@/types/tmdb'
import { getDisplayPosterUrl, getDisplayTitle, getEffectiveMediaType, getMediaTypeLabel } from '@/utils/formatters'

type SearchTab = 'all' | MediaType | 'users'
const TABS: Array<{ value: SearchTab; label: string }> = [
  { value: 'all', label: 'All' }, { value: 'movie', label: 'Movies' },
  { value: 'series', label: 'Series' }, { value: 'shorts', label: 'Shorts' },
  { value: 'users', label: 'Users' },
]

export function FullSearchPage({ initialQuery }: { initialQuery: string }) {
  const router = useRouter()
  const { entries } = useMedia()
  const [query, setQuery] = useState(initialQuery)
  const [tab, setTab] = useState<SearchTab>('all')
  const [users, setUsers] = useState<PublicProfileDocument[]>([])
  const [usersLoading, setUsersLoading] = useState(false)
  const { results: tmdbResults, loading: tmdbLoading, search: searchTMDB, clearResults } = useTMDBSearch('all')

  useEffect(() => {
    if (tab === 'users') { clearResults(); return }
    if (query.trim().length >= 2) searchTMDB(query)
    else clearResults()
  }, [query, tab, searchTMDB, clearResults])

  useEffect(() => {
    const needle = query.trim()
    if (tab !== 'all' && tab !== 'users') { setUsers([]); setUsersLoading(false); return }
    if (needle.length < 2) { setUsers([]); setUsersLoading(false); return }
    let active = true
    setUsersLoading(true)
    const timer = window.setTimeout(() => {
      searchPublicProfiles(needle).then((results) => { if (active) setUsers(results) })
        .catch(() => { if (active) setUsers([]) })
        .finally(() => { if (active) setUsersLoading(false) })
    }, 250)
    return () => { active = false; window.clearTimeout(timer) }
  }, [query, tab])

  const libraryResults = useMemo(() => {
    const needle = query.trim().toLocaleLowerCase()
    if (!needle) return []
    return entries.filter((entry) => {
      const matches = [entry.title, entry.nativeTitle, entry.country, ...(entry.genres ?? [])]
        .some((value) => value?.toLocaleLowerCase().includes(needle))
      return matches && (tab === 'all' || tab === 'users' || getEffectiveMediaType(entry) === tab)
    })
  }, [entries, query, tab])

  const externalResults = useMemo(() => {
    const listed = new Set(entries.map((entry) => entry.tmdbId).filter(Boolean))
    return tmdbResults.filter((result) => !listed.has(result.tmdbId) && (
      tab === 'all' || tab === 'users' || (tab !== 'shorts' && result.type === tab)
    ))
  }, [entries, tmdbResults, tab])

  const showTitles = tab !== 'users'
  const showUsers = tab === 'all' || tab === 'users'
  const hasQuery = query.trim().length > 0

  return <AppLayout title="Search" subtitle="Titles and public profiles">
    <div className="space-y-4">
      <div className="relative"><Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-white/30" /><input autoFocus value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search titles or users..." className="h-11 w-full rounded-xl border border-white/10 bg-white/5 pl-10 pr-3 text-sm text-white outline-none transition focus:border-blue-500/40" /></div>
      <div className="flex gap-2 overflow-x-auto pb-1">{TABS.map((item) => <button key={item.value} onClick={() => setTab(item.value)} className={`h-9 shrink-0 rounded-lg border px-4 text-sm ${tab === item.value ? 'border-blue-500/40 bg-blue-500/15 text-blue-200' : 'border-white/10 bg-white/[0.025] text-white/45'}`}>{item.label}</button>)}</div>
      {!hasQuery && <div className="rounded-xl border border-dashed border-white/10 py-20 text-center text-sm text-white/35">Enter a title, username, or display name to search.</div>}
      {hasQuery && showTitles && <section><div className="mb-3 flex items-center justify-between"><h2 className="text-sm font-semibold text-white">Titles</h2>{tmdbLoading && <span className="inline-flex items-center gap-1.5 text-xs text-white/35"><Loader2 className="h-3.5 w-3.5 animate-spin" />Searching TMDB</span>}</div>
        {libraryResults.length > 0 && <><p className="mb-2 text-[10px] font-semibold uppercase text-white/30">In Your Library</p><div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">{libraryResults.map((entry) => <LibraryResult key={entry.id || entry.internalId} entry={entry} onOpen={() => router.push(`/my-list?entry=${entry.id}`)} />)}</div></>}
        {externalResults.length > 0 && <><p className="mb-2 mt-5 text-[10px] font-semibold uppercase text-white/30">On TMDB</p><div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">{externalResults.map((result) => <TMDBResult key={`${result.type}-${result.tmdbId}`} result={result} onOpen={() => router.push(`/add-entry?tmdbId=${result.tmdbId}&tmdbType=${result.type}`)} />)}</div></>}
        {!tmdbLoading && libraryResults.length === 0 && externalResults.length === 0 && <p className="rounded-xl border border-dashed border-white/10 py-12 text-center text-sm text-white/35">No matching titles found.</p>}
      </section>}
      {hasQuery && showUsers && <section><div className="mb-3 flex items-center justify-between"><h2 className="text-sm font-semibold text-white">Users</h2>{usersLoading && <Loader2 className="h-4 w-4 animate-spin text-white/35" />}</div>{users.length > 0 ? <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">{users.map((profile) => <button key={profile.username} onClick={() => router.push(`/u/${profile.username}`)} className="flex items-center gap-3 rounded-xl border border-white/10 bg-white/[0.035] p-3 text-left hover:border-blue-500/30"><div className="h-12 w-12 shrink-0 overflow-hidden rounded-full bg-white/10">{profile.profilePhotoUrl ? <TMDBPosterImage src={profile.profilePhotoUrl} alt={profile.displayName} width={48} height={48} className="h-full w-full object-cover" /> : <div className="flex h-full items-center justify-center"><UserRound className="h-5 w-5 text-white/30" /></div>}</div><div className="min-w-0"><p className="truncate text-sm font-semibold text-white">{profile.displayName}</p><p className="truncate text-xs text-blue-300">@{profile.username}</p>{profile.bio && <p className="mt-1 line-clamp-1 text-xs text-white/35">{profile.bio}</p>}</div></button>)}</div> : !usersLoading && query.trim().length >= 2 ? <p className="rounded-xl border border-dashed border-white/10 py-10 text-center text-sm text-white/35">No matching public profiles found.</p> : null}</section>}
    </div>
  </AppLayout>
}

function LibraryResult({ entry, onOpen }: { entry: MediaEntry; onOpen: () => void }) {
  const type = getEffectiveMediaType(entry)
  return <ResultCard title={getDisplayTitle(entry)} type={type} year={entry.yearMade} country={entry.country} poster={getDisplayPosterUrl(entry)} action="View" onOpen={onOpen} />
}

function TMDBResult({ result, onOpen }: { result: NormalizedTMDBResult; onOpen: () => void }) {
  return <ResultCard title={result.title} type={result.type} year={result.year} country={result.country} poster={result.posterUrl} action="Add" onOpen={onOpen} />
}

function ResultCard({ title, type, year, country, poster, action, onOpen }: { title: string; type: MediaType; year: number | null | undefined; country: string | null | undefined; poster: string | null | undefined; action: string; onOpen: () => void }) {
  const Icon = type === 'movie' ? Film : type === 'shorts' ? Clapperboard : Tv
  return <button onClick={onOpen} className="flex min-w-0 items-center gap-3 rounded-xl border border-white/10 bg-white/[0.035] p-3 text-left hover:border-blue-500/30"><div className="h-16 w-11 shrink-0 overflow-hidden rounded bg-white/10">{poster ? <TMDBPosterImage src={poster} alt={title} width={44} height={64} className="h-full w-full object-cover" /> : <div className="flex h-full items-center justify-center"><Icon className="h-4 w-4 text-white/25" /></div>}</div><div className="min-w-0 flex-1"><p className="line-clamp-2 text-sm font-semibold text-white">{title}</p><p className="mt-1 text-xs text-white/40">{getMediaTypeLabel(type)}{year ? ` · ${year}` : ''}{country ? ` · ${country}` : ''}</p></div><span className="text-xs font-medium text-blue-300">{action}</span></button>
}
