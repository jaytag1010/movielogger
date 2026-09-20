'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { ArrowLeft, Calculator, Share2 } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { getAllPublicTitles, getPublicList, getPublicProfile, getPublicTitlesByIds } from '@/lib/firebase/publicSharing'
import type { PublicListDocument, PublicProfileDocument, PublicTitleDocument } from '@/types/public'
import { PublicShell, PublicTitleCard } from '@/components/public/PublicProfileView'
import { PublicTitleDetails } from '@/components/public/PublicTitleDetails'
import { ListWatchProjection } from '@/components/lists/ListWatchProjection'
import { isSystemListType } from '@/utils/systemLists'

export default function PublicListPage({ params }: { params: { username: string; slug: string } }) {
  const [profile, setProfile] = useState<PublicProfileDocument | null>(null)
  const [list, setList] = useState<PublicListDocument | null>(null)
  const [titles, setTitles] = useState<PublicTitleDocument[]>([])
  const [selected, setSelected] = useState<PublicTitleDocument | null>(null)
  const [loading, setLoading] = useState(true)
  const [projectionOpen, setProjectionOpen] = useState(false)
  useEffect(() => {
    Promise.all([getPublicProfile(params.username), getPublicList(params.username, params.slug)])
      .then(async ([nextProfile, nextList]) => {
        if (!nextProfile?.enabled || !nextList || nextList.visibility !== 'public') return
        setProfile(nextProfile); setList(nextList)
        const available = nextList.kind === 'system' && nextList.autoUpdate && nextList.systemType && isSystemListType(nextList.systemType)
          ? filterPublicSystemList(nextList.systemType, await getAllPublicTitles(params.username))
          : await getPublicTitlesByIds(params.username, nextList.titleIds)
        setTitles(available)
      }).catch(() => {}).finally(() => setLoading(false))
  }, [params.username, params.slug])
  async function share() {
    if (navigator.share) await navigator.share({ title: list?.name, url: location.href }).catch(() => {})
    else { await navigator.clipboard.writeText(location.href); toast.success('List link copied.') }
  }
  if (loading) return <PublicShell><div className="py-28 text-center text-white/45">Loading list…</div></PublicShell>
  if (!profile || !list) return <PublicShell><div className="py-28 text-center"><h1 className="text-xl font-semibold">This list is private or unavailable.</h1></div></PublicShell>
  return <PublicShell><div className="mt-6"><Link href={`/u/${profile.username}`} className="inline-flex items-center text-sm text-white/45 hover:text-white"><ArrowLeft className="mr-2 h-4 w-4" />Back to @{profile.username}</Link><div className="mt-5 flex items-start justify-between gap-3"><div><h1 className="text-2xl font-bold">{list.name}</h1>{list.description && <p className="mt-2 max-w-2xl text-sm text-white/50">{list.description}</p>}<p className="mt-2 text-xs text-blue-300">{titles.length} public title{titles.length === 1 ? '' : 's'}</p></div><div className="flex gap-2"><Button variant="outline" onClick={() => setProjectionOpen(true)} disabled={!titles.length}><Calculator className="mr-2 h-4 w-4" />Projection</Button><Button size="icon" variant="outline" onClick={share}><Share2 className="h-4 w-4" /></Button></div></div><div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6">{titles.map((title) => <PublicTitleCard key={title.publicId} title={title} onClick={() => setSelected(title)} />)}</div>{titles.length === 0 && <p className="py-16 text-center text-sm text-white/35">No publicly visible titles are currently in this list.</p>}</div><PublicTitleDetails title={selected} open={!!selected} onOpenChange={(open) => { if (!open) setSelected(null) }} /><ListWatchProjection entries={titles} owner={false} open={projectionOpen} onOpenChange={setProjectionOpen} /></PublicShell>
}

function filterPublicSystemList(type: string, titles: PublicTitleDocument[]): PublicTitleDocument[] {
  if (type === 'all-titles') return titles
  const mediaType = type.includes('movie') ? 'movie' : type.includes('series') ? 'series' : 'shorts'
  const typed = titles.filter((title) => title.type === mediaType)
  if (!type.startsWith('top-10-')) return typed
  const ranked = typed.filter((title) => title.status === 'completed' && Number(title.personalRating) > 0).sort((a, b) => Number(b.personalRating) - Number(a.personalRating) || a.title.localeCompare(b.title))
  let denseRank = 0
  let previous: number | null = null
  return ranked.filter((title) => {
    const rating = Number(title.personalRating)
    if (previous == null || rating !== previous) { denseRank += 1; previous = rating }
    return denseRank <= 10
  })
}
