'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { Clapperboard, Film, Folder, Globe2, Share2, Star, Tv } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { TMDBPosterImage } from '@/components/common/TMDBPosterImage'
import { getPublicLists, getPublicProfile } from '@/lib/firebase/publicSharing'
import type { PublicListDocument, PublicProfileDocument, PublicTitleDocument } from '@/types/public'
import { MEDIA_STATUS_LABELS } from '@/types/media'
import { getMediaTypeLabel } from '@/utils/formatters'

export function PublicProfileView({ username }: { username: string }) {
  const [profile, setProfile] = useState<PublicProfileDocument | null>(null)
  const [folders, setFolders] = useState<PublicListDocument[]>([])
  const [loading, setLoading] = useState(true)
  const [privateProfile, setPrivateProfile] = useState(false)

  useEffect(() => {
    Promise.all([getPublicProfile(username), getPublicLists(username)])
      .then(([nextProfile, nextFolders]) => {
        if (!nextProfile?.enabled) { setPrivateProfile(true); return }
        setProfile(nextProfile)
        setFolders(nextFolders)
      })
      .catch(() => setPrivateProfile(true))
      .finally(() => setLoading(false))
  }, [username])

  async function share() {
    const url = window.location.href
    if (navigator.share) await navigator.share({ title: `${profile?.displayName} on MovieLogger`, url }).catch(() => {})
    else { await navigator.clipboard.writeText(url); toast.success('Profile link copied.') }
  }

  if (loading) return <PublicShell><div className="py-28 text-center text-white/45">Loading public profile…</div></PublicShell>
  if (privateProfile || !profile) return <PublicShell><div className="mx-auto mt-24 max-w-md rounded-xl border border-white/10 bg-white/5 p-8 text-center"><Globe2 className="mx-auto h-9 w-9 text-white/25" /><h1 className="mt-4 text-xl font-semibold text-white">This MovieLogger profile is private.</h1><p className="mt-2 text-sm text-white/40">The owner has not made this profile available publicly.</p></div></PublicShell>

  return <PublicShell>
    <header className="mt-6 rounded-2xl border border-white/10 bg-white/[0.04] p-5 sm:p-7">
      <div className="flex items-start gap-4"><div className="h-20 w-20 shrink-0 overflow-hidden rounded-full border border-white/10 bg-white/5">{profile.profilePhotoUrl ? <TMDBPosterImage src={profile.profilePhotoUrl} alt={profile.displayName} width={80} height={80} className="h-full w-full object-cover" /> : <div className="flex h-full items-center justify-center text-2xl font-bold text-white/40">{profile.displayName.slice(0, 2).toUpperCase()}</div>}</div><div className="min-w-0 flex-1"><h1 className="truncate text-2xl font-bold text-white">{profile.displayName}</h1><p className="text-sm text-blue-300">@{profile.username}</p>{profile.bio && <p className="mt-2 max-w-2xl text-sm leading-relaxed text-white/55">{profile.bio}</p>}</div><Button size="icon" variant="outline" onClick={share} title="Share public profile"><Share2 className="h-4 w-4" /></Button></div>
      {profile.showStats && <PublicSummary profile={profile} />}
    </header>
    <section className="mt-6"><h2 className="mb-3 text-lg font-semibold text-white">Public Folders</h2>{folders.length ? <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">{folders.map((folder) => { const count = folder.titleCount ?? folder.titleIds.length; return <Link key={folder.slug} href={`/u/${profile.username}/lists/${folder.slug}`} className="rounded-xl border border-white/10 bg-white/[0.035] p-4 transition hover:border-blue-500/30 hover:bg-white/[0.06]"><div className="flex items-center gap-2"><Folder className="h-4 w-4 text-blue-300" /><p className="font-semibold text-white">{folder.name}</p></div>{folder.description && <p className="mt-2 line-clamp-2 text-xs text-white/40">{folder.description}</p>}<p className="mt-2 text-xs text-blue-300">{count} title{count === 1 ? '' : 's'}</p></Link> })}</div> : <p className="rounded-xl border border-dashed border-white/10 py-14 text-center text-sm text-white/35">No folders are currently public.</p>}</section>
  </PublicShell>
}

function PublicSummary({ profile }: { profile: PublicProfileDocument }) {
  const stats = profile.stats
  const items = [['Total Titles', stats.publicTitles], ['Movies', stats.movies], ['Series', stats.series], ['Shorts', stats.shorts], ['Watch Time', `${stats.watchHours.toFixed(2)} h`], ['Avg. Rating', stats.averageRating?.toFixed(1) ?? '—']]
  return <div className="mt-5 grid grid-cols-2 gap-2 border-t border-white/10 pt-4 sm:grid-cols-3 lg:grid-cols-6">{items.map(([label, value]) => <div key={label} className="rounded-lg bg-white/[0.035] px-3 py-2"><p className="text-lg font-semibold text-white">{value}</p><p className="text-[10px] uppercase text-white/35">{label}</p></div>)}</div>
}

export function PublicShell({ children }: { children: React.ReactNode }) {
  return <div className="min-h-screen bg-cinema-darker text-white"><div className="mx-auto max-w-6xl px-4 py-5"><Link href="/" className="inline-flex items-center gap-2 text-sm font-semibold text-white/65"><img src="/logo.png" alt="MovieLogger" className="h-7 w-7 rounded-md" />MovieLogger</Link>{children}<footer className="py-10 text-center text-xs text-white/25">Shared through MovieLogger</footer></div></div>
}

export function PublicTitleCard({ title, onClick }: { title: PublicTitleDocument; onClick: () => void }) {
  const Icon = title.type === 'movie' ? Film : title.type === 'shorts' ? Clapperboard : Tv
  return <button onClick={onClick} className="min-w-0 overflow-hidden rounded-xl border border-white/10 bg-white/[0.035] text-left transition hover:-translate-y-0.5 hover:border-white/20"><div className="relative aspect-[2/3] w-full bg-white/5">{title.posterUrl ? <TMDBPosterImage src={title.posterUrl} alt={title.title} fill sizes="(max-width: 640px) 50vw, 180px" className="object-cover" /> : <div className="flex h-full items-center justify-center"><Icon className="h-7 w-7 text-white/20" /></div>}</div><div className="p-2.5"><p className="line-clamp-2 min-h-10 text-sm font-semibold text-white">{title.title}</p><div className="mt-1 flex items-center justify-between text-[11px] text-white/40"><span>{title.yearMade ?? getMediaTypeLabel(title.type)}</span>{title.personalRating != null && <span className="inline-flex items-center gap-0.5 text-amber-300"><Star className="h-3 w-3 fill-current" />{title.personalRating.toFixed(1)}</span>}</div><p className="mt-1 truncate text-[10px] text-blue-300/70">{MEDIA_STATUS_LABELS[title.status]}</p></div></button>
}
