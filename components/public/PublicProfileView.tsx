'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { Clapperboard, Copy, Film, Globe2, Search, Share2, Star, Tv } from 'lucide-react'
import type { QueryDocumentSnapshot } from 'firebase/firestore'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { TMDBPosterImage } from '@/components/common/TMDBPosterImage'
import { getPublicLists, getPublicProfile, getPublicTitles } from '@/lib/firebase/publicSharing'
import type { PublicListDocument, PublicProfileDocument, PublicTitleDocument } from '@/types/public'
import { MEDIA_STATUS_LABELS, MediaStatus, MediaType } from '@/types/media'
import { PublicTitleDetails } from './PublicTitleDetails'
import { formatWatchHours, getMediaTypeLabel } from '@/utils/formatters'

const PAGE_SIZE = 24

export function PublicProfileView({ username }: { username: string }) {
  const [profile, setProfile] = useState<PublicProfileDocument | null>(null)
  const [titles, setTitles] = useState<PublicTitleDocument[]>([])
  const [lists, setLists] = useState<PublicListDocument[]>([])
  const [loading, setLoading] = useState(true)
  const [privateProfile, setPrivateProfile] = useState(false)
  const [hasMore, setHasMore] = useState(false)
  const [cursor, setCursor] = useState<QueryDocumentSnapshot | null>(null)
  const [type, setType] = useState<'all' | MediaType>('all')
  const [status, setStatus] = useState<'all' | MediaStatus>('all')
  const [sort, setSort] = useState<'newest' | 'title' | 'rating'>('newest')
  const [search, setSearch] = useState('')
  const [appliedSearch, setAppliedSearch] = useState('')
  const [selected, setSelected] = useState<PublicTitleDocument | null>(null)
  const [watchingTitles, setWatchingTitles] = useState<PublicTitleDocument[]>([])
  const [topRatedTitles, setTopRatedTitles] = useState<PublicTitleDocument[]>([])

  const loadTitles = useCallback(async (append = false) => {
    const result = await getPublicTitles(username, { type, status, search: appliedSearch, sort, pageSize: PAGE_SIZE, cursor: append ? cursor : null })
    setTitles((current) => append ? [...current, ...result.titles] : result.titles)
    setCursor(result.cursor)
    setHasMore(result.hasMore)
  }, [username, type, status, appliedSearch, sort, cursor])

  useEffect(() => {
    Promise.all([getPublicProfile(username), getPublicLists(username)])
      .then(async ([nextProfile, nextLists]) => {
        if (!nextProfile?.enabled) { setPrivateProfile(true); return }
        setProfile(nextProfile); setLists(nextLists)
        const [initial, watching, topRated] = await Promise.all([
          getPublicTitles(username, { pageSize: PAGE_SIZE }),
          getPublicTitles(username, { status: 'watching', pageSize: 6 }),
          getPublicTitles(username, { sort: 'rating', pageSize: 6 }),
        ])
        setTitles(initial.titles); setCursor(initial.cursor); setHasMore(initial.hasMore)
        setWatchingTitles(watching.titles)
        setTopRatedTitles(topRated.titles.filter((title) => title.personalRating != null))
      })
      .catch(() => setPrivateProfile(true))
      .finally(() => setLoading(false))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [username])

  useEffect(() => {
    if (!profile) return
    setCursor(null)
    loadTitles(false).catch(() => toast.error('Could not load public titles.'))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [type, status, sort, appliedSearch])

  async function share() {
    const url = window.location.href
    if (navigator.share) await navigator.share({ title: `${profile?.displayName} on MovieLogger`, url }).catch(() => {})
    else { await navigator.clipboard.writeText(url); toast.success('Profile link copied.') }
  }

  if (loading) return <PublicShell><div className="py-28 text-center text-white/45">Loading public profile…</div></PublicShell>
  if (privateProfile || !profile) return <PublicShell><div className="mx-auto mt-24 max-w-md rounded-xl border border-white/10 bg-white/5 p-8 text-center"><Globe2 className="mx-auto h-9 w-9 text-white/25" /><h1 className="mt-4 text-xl font-semibold text-white">This MovieLogger profile is private.</h1><p className="mt-2 text-sm text-white/40">The owner has not made this profile available publicly.</p></div></PublicShell>

  return <PublicShell>
    <header className="rounded-2xl border border-white/10 bg-white/[0.04] p-5 sm:p-7">
      <div className="flex items-start gap-4">
        <div className="h-20 w-20 shrink-0 overflow-hidden rounded-full border border-white/10 bg-white/5">{profile.profilePhotoUrl ? <TMDBPosterImage src={profile.profilePhotoUrl} alt={profile.displayName} width={80} height={80} className="h-full w-full object-cover" /> : <div className="flex h-full items-center justify-center text-2xl font-bold text-white/40">{profile.displayName.slice(0, 2).toUpperCase()}</div>}</div>
        <div className="min-w-0 flex-1"><h1 className="truncate text-2xl font-bold text-white">{profile.displayName}</h1><p className="text-sm text-blue-300">@{profile.username}</p>{profile.bio && <p className="mt-2 max-w-2xl text-sm leading-relaxed text-white/55">{profile.bio}</p>}</div>
        <Button size="icon" variant="outline" onClick={share} title="Share public profile"><Share2 className="h-4 w-4" /></Button>
      </div>
      {profile.showStats && <Stats profile={profile} />}
    </header>
    {watchingTitles.length > 0 && <FeaturedRow title="Currently Watching" titles={watchingTitles} onSelect={setSelected} />}
    {topRatedTitles.length > 0 && <FeaturedRow title="Top Rated" titles={topRatedTitles} onSelect={setSelected} />}

    {lists.length > 0 && <section className="mt-6"><h2 className="mb-3 text-lg font-semibold text-white">Public Lists</h2><div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">{lists.map((list) => <Link key={list.slug} href={`/u/${profile.username}/lists/${list.slug}`} className="rounded-xl border border-white/10 bg-white/[0.035] p-4 transition hover:border-blue-500/30 hover:bg-white/[0.06]"><p className="font-semibold text-white">{list.name}</p>{list.description && <p className="mt-1 line-clamp-2 text-xs text-white/40">{list.description}</p>}<p className="mt-2 text-xs text-blue-300">{list.titleIds.length} title{list.titleIds.length === 1 ? '' : 's'}</p></Link>)}</div></section>}

    <section className="mt-7">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between"><div><h2 className="text-lg font-semibold text-white">Public Library</h2><p className="text-xs text-white/35">Only titles deliberately shared by @{profile.username}</p></div><div className="flex gap-2"><select value={status} onChange={(event) => setStatus(event.target.value as typeof status)} className="h-10 rounded-lg border border-white/10 bg-[#11131d] px-3 text-sm text-white"><option value="all">All Statuses</option>{Object.entries(MEDIA_STATUS_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select><select value={sort} onChange={(event) => setSort(event.target.value as typeof sort)} className="h-10 rounded-lg border border-white/10 bg-[#11131d] px-3 text-sm text-white"><option value="newest">Newest Added</option><option value="title">Title A–Z</option><option value="rating">Highest Rated</option></select></div></div>
      <div className="mt-4 grid grid-cols-4 gap-2">{(['all', 'movie', 'series', 'shorts'] as const).map((value) => <button key={value} onClick={() => setType(value)} className={`rounded-lg border px-2 py-2 text-xs font-medium ${type === value ? 'border-blue-500/40 bg-blue-500/15 text-blue-200' : 'border-white/10 bg-white/[0.025] text-white/45'}`}>{value === 'all' ? 'All' : `${getMediaTypeLabel(value)}${value === 'movie' ? 's' : ''}`}</button>)}</div>
      <form className="relative mt-3" onSubmit={(event) => { event.preventDefault(); setAppliedSearch(search.trim()) }}><Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-white/25" /><Input value={search} onChange={(event) => setSearch(event.target.value)} className="pl-10 pr-24" placeholder="Search public titles…" /><Button type="submit" size="sm" className="absolute right-1.5 top-1.5 h-7">Search</Button></form>

      {titles.length === 0 ? <div className="py-16 text-center text-sm text-white/35">No public titles match these filters.</div> : <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6">{titles.map((title) => <PublicTitleCard key={title.publicId} title={title} onClick={() => setSelected(title)} />)}</div>}
      {hasMore && <Button variant="outline" className="mx-auto mt-5 flex" onClick={() => loadTitles(true)}>Load More</Button>}
    </section>
    <PublicTitleDetails title={selected} open={!!selected} onOpenChange={(open) => { if (!open) setSelected(null) }} />
  </PublicShell>
}

export function PublicShell({ children }: { children: React.ReactNode }) {
  return <div className="min-h-screen bg-cinema-darker text-white"><div className="mx-auto max-w-6xl px-4 py-5"><Link href="/" className="inline-flex items-center gap-2 text-sm font-semibold text-white/65"><img src="/logo.png" alt="MovieLogger" className="h-7 w-7 rounded-md" />MovieLogger</Link>{children}<footer className="py-10 text-center text-xs text-white/25">Shared through MovieLogger</footer></div></div>
}

export function PublicTitleCard({ title, onClick }: { title: PublicTitleDocument; onClick: () => void }) {
  const Icon = title.type === 'movie' ? Film : title.type === 'shorts' ? Clapperboard : Tv
  return <button onClick={onClick} className="min-w-0 overflow-hidden rounded-xl border border-white/10 bg-white/[0.035] text-left transition hover:-translate-y-0.5 hover:border-white/20"><div className="relative aspect-[2/3] w-full bg-white/5">{title.posterUrl ? <TMDBPosterImage src={title.posterUrl} alt={title.title} fill sizes="(max-width: 640px) 50vw, 180px" className="object-cover" /> : <div className="flex h-full items-center justify-center"><Icon className="h-7 w-7 text-white/20" /></div>}</div><div className="p-2.5"><p className="line-clamp-2 min-h-10 text-sm font-semibold text-white">{title.title}</p><div className="mt-1 flex items-center justify-between text-[11px] text-white/40"><span>{title.yearMade ?? getMediaTypeLabel(title.type)}</span>{title.personalRating != null && <span className="inline-flex items-center gap-0.5 text-amber-300"><Star className="h-3 w-3 fill-current" />{title.personalRating.toFixed(1)}</span>}</div><p className="mt-1 truncate text-[10px] text-blue-300/70">{MEDIA_STATUS_LABELS[title.status]}</p></div></button>
}

function Stats({ profile }: { profile: PublicProfileDocument }) {
  const stats = profile.stats
  const items = [['Titles', stats.publicTitles], ['Movies', stats.movies], ['Series', stats.series], ['Shorts', stats.shorts], ['Completed', stats.completed], ['Watch Hours', stats.watchHours.toFixed(2)], ['Average Rating', stats.averageRating?.toFixed(2) ?? '—']]
  return <div className="mt-5 grid grid-cols-2 gap-2 border-t border-white/10 pt-4 sm:grid-cols-4 lg:grid-cols-7">{items.map(([label, value]) => <div key={label} className="rounded-lg bg-white/[0.035] px-3 py-2"><p className="text-lg font-semibold text-white">{value}</p><p className="text-[10px] uppercase text-white/35">{label}</p></div>)}</div>
}

function FeaturedRow({ title, titles, onSelect }: { title: string; titles: PublicTitleDocument[]; onSelect: (title: PublicTitleDocument) => void }) {
  return <section className="mt-6"><h2 className="mb-3 text-lg font-semibold text-white">{title}</h2><div className="flex gap-3 overflow-x-auto pb-2">{titles.map((item) => <button key={item.publicId} onClick={() => onSelect(item)} className="w-24 shrink-0 text-left"><div className="relative aspect-[2/3] overflow-hidden rounded-lg border border-white/10 bg-white/5">{item.posterUrl ? <TMDBPosterImage src={item.posterUrl} alt={item.title} fill sizes="96px" className="object-cover" /> : null}</div><p className="mt-1.5 line-clamp-2 text-xs font-medium text-white/75">{item.title}</p></button>)}</div></section>
}
