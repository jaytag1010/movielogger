'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { ArrowDown, ArrowLeft, ArrowUp, Calculator, ChevronLeft, ChevronRight, Settings2 } from 'lucide-react'
import { toast } from 'sonner'
import { AppLayout } from '@/components/layout/AppLayout'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { MediaCard } from '@/components/media/MediaCard'
import { ListWatchProjection } from '@/components/lists/ListWatchProjection'
import { useMedia } from '@/hooks/useMedia'
import { useAuthStore } from '@/store/authStore'
import { getUserProfile, updateUserProfile, type UserProfile } from '@/lib/firebase/firestore'
import { getOwnerLists, publishSystemList } from '@/lib/firebase/publicSharing'
import type { MediaEntry } from '@/types/media'
import { isSystemListType, getSystemListConfig, resolveSystemListEntries, SYSTEM_LISTS } from '@/utils/systemLists'
import type { SystemListConfig, SystemListType } from '@/types/public'
import { getDisplayTitle } from '@/utils/formatters'
import { isEntryPublic, normalizePublicVisibility } from '@/utils/publicVisibility'

const PAGE_SIZE = 24

export default function OwnerListPage({ params }: { params: { slug: string } }) {
  const { entries, loading: mediaLoading } = useMedia()
  const { user } = useAuthStore()
  const [name, setName] = useState('List')
  const [description, setDescription] = useState('')
  const [listEntries, setListEntries] = useState<MediaEntry[]>([])
  const [loading, setLoading] = useState(true)
  const [projectionOpen, setProjectionOpen] = useState(false)
  const [page, setPage] = useState(1)
  const [profile, setProfile] = useState<UserProfile | null>(null)
  const [systemConfig, setSystemConfig] = useState<SystemListConfig | null>(null)
  const [manageOpen, setManageOpen] = useState(false)
  const [draftIds, setDraftIds] = useState<string[]>([])
  const [search, setSearch] = useState('')
  useEffect(() => {
    if (!user || mediaLoading) return
    Promise.all([getUserProfile(user.uid), getOwnerLists(user.uid, null, entries)])
      .then(([profile, custom]) => {
        setProfile(profile)
        if (isSystemListType(params.slug)) {
          const definition = SYSTEM_LISTS.find((item) => item.type === params.slug)!
          const config = getSystemListConfig(profile.systemLists, params.slug)
          setSystemConfig(config)
          setName(definition.name); setDescription(definition.description); setListEntries(resolveSystemListEntries(params.slug, config, entries))
        } else {
          const list = custom.find((item) => item.slug === params.slug)
          if (!list) return
          const byId = new Map(entries.filter((entry) => entry.id).map((entry) => [entry.id!, entry]))
          setName(list.name); setDescription(list.description); setListEntries(list.entryIds.map((id) => byId.get(id)).filter(Boolean) as MediaEntry[])
        }
      }).finally(() => setLoading(false))
  }, [user, mediaLoading, entries, params.slug])
  const pageCount = Math.max(1, Math.ceil(listEntries.length / PAGE_SIZE))
  const visible = useMemo(() => listEntries.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE), [listEntries, page])
  const searchResults = useMemo(() => {
    const needle = search.trim().toLocaleLowerCase()
    if (!needle) return []
    return entries.filter((entry) => entry.id && getDisplayTitle(entry).toLocaleLowerCase().includes(needle)).slice(0, 40)
  }, [entries, search])
  function openManager() { setDraftIds(systemConfig?.snapshotEntryIds ?? []); setSearch(''); setManageOpen(true) }
  function toggleDraft(id: string) { setDraftIds((current) => current.includes(id) ? current.filter((item) => item !== id) : [...current, id]) }
  function moveDraft(index: number, delta: number) { setDraftIds((current) => { const target = index + delta; if (target < 0 || target >= current.length) return current; const next = [...current]; [next[index], next[target]] = [next[target], next[index]]; return next }) }
  async function saveSnapshot() {
    if (!user || !profile || !systemConfig || !isSystemListType(params.slug)) return
    const nextConfig = { ...systemConfig, snapshotEntryIds: draftIds }
    const nextProfile = { ...profile, systemLists: { ...(profile.systemLists ?? {}), [params.slug]: nextConfig } }
    try {
      await updateUserProfile(user.uid, { systemLists: nextProfile.systemLists })
      const byId = new Map(entries.filter((entry) => entry.id).map((entry) => [entry.id!, entry]))
      const resolved = draftIds.map((id) => byId.get(id)).filter(Boolean) as MediaEntry[]
      if (nextConfig.visibility === 'public' && profile.publicUsername) {
        const publicIds = resolved.filter((entry) => isEntryPublic(entry, profile.publicProfileEnabled, normalizePublicVisibility(profile.publicVisibility))).map((entry) => entry.publicId).filter((id): id is string => !!id)
        const definition = SYSTEM_LISTS.find((item) => item.type === params.slug)!
        await publishSystemList(profile.publicUsername, { slug: params.slug, name: definition.name, description: definition.description, visibility: 'public', kind: 'system', systemType: params.slug as SystemListType, autoUpdate: false, titleCount: publicIds.length, titleIds: publicIds })
      }
      setProfile(nextProfile); setSystemConfig(nextConfig); setListEntries(resolved); setManageOpen(false); setPage(1)
      toast.success('Snapshot updated.')
    } catch { toast.error('Could not update snapshot.') }
  }
  return <AppLayout title={name} subtitle={`${listEntries.length} title${listEntries.length === 1 ? '' : 's'}`}>
    <div className="space-y-4"><div className="flex flex-wrap items-start justify-between gap-3"><div><Link href="/profile" className="inline-flex items-center text-xs text-white/40 hover:text-white"><ArrowLeft className="mr-1 h-3.5 w-3.5" />Back to Profile</Link>{description && <p className="mt-2 max-w-xl text-sm text-white/45">{description}</p>}</div><div className="flex gap-2">{systemConfig && !systemConfig.autoUpdate && <Button variant="outline" onClick={openManager}><Settings2 className="mr-2 h-4 w-4" />Manage Snapshot</Button>}<Button onClick={() => setProjectionOpen(true)} disabled={!listEntries.length}><Calculator className="mr-2 h-4 w-4" />Watch Time Projection</Button></div></div>
      {loading ? <p className="py-20 text-center text-sm text-white/40">Loading list…</p> : visible.length ? <div className="space-y-3">{visible.map((entry, index) => <MediaCard key={entry.id || entry.internalId} entry={entry} index={index} />)}</div> : <p className="rounded-lg border border-dashed border-white/10 py-20 text-center text-sm text-white/35">This list has no titles.</p>}
      {pageCount > 1 && <div className="flex items-center justify-center gap-3"><Button size="icon" variant="outline" disabled={page === 1} onClick={() => setPage((value) => value - 1)}><ChevronLeft className="h-4 w-4" /></Button><span className="text-xs text-white/40">Page {page} of {pageCount}</span><Button size="icon" variant="outline" disabled={page === pageCount} onClick={() => setPage((value) => value + 1)}><ChevronRight className="h-4 w-4" /></Button></div>}
    </div><ListWatchProjection entries={listEntries} owner open={projectionOpen} onOpenChange={setProjectionOpen} />
    <Dialog open={manageOpen} onOpenChange={setManageOpen}><DialogContent className="max-w-2xl"><DialogHeader><DialogTitle>Manage Snapshot</DialogTitle><DialogDescription>Add, remove, and reorder references without changing the underlying library titles.</DialogDescription></DialogHeader><Input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search library to add a title…" />{searchResults.length > 0 && <div className="max-h-40 overflow-y-auto rounded-lg border border-white/10">{searchResults.map((entry) => <button key={entry.id} onClick={() => toggleDraft(entry.id!)} className="flex w-full justify-between border-b border-white/5 px-3 py-2 text-left text-sm last:border-0"><span className="truncate">{getDisplayTitle(entry)}</span><span className="text-xs text-blue-300">{draftIds.includes(entry.id!) ? 'Remove' : 'Add'}</span></button>)}</div>}<div className="max-h-64 space-y-1 overflow-y-auto">{draftIds.map((id, index) => { const entry = entries.find((item) => item.id === id); return <div key={id} className="flex items-center gap-2 rounded-lg bg-white/[0.035] px-2 py-2"><span className="w-7 text-center text-xs text-white/30">{index + 1}</span><span className="min-w-0 flex-1 truncate text-sm">{entry ? getDisplayTitle(entry) : 'Unavailable title'}</span><button disabled={index === 0} onClick={() => moveDraft(index, -1)}><ArrowUp className="h-4 w-4" /></button><button disabled={index === draftIds.length - 1} onClick={() => moveDraft(index, 1)}><ArrowDown className="h-4 w-4" /></button><button onClick={() => toggleDraft(id)} className="px-1 text-red-300">×</button></div> })}</div><Button onClick={saveSnapshot}>Save Snapshot</Button></DialogContent></Dialog>
  </AppLayout>
}
