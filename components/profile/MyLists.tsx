'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { Folder, Globe2, Lock, RefreshCw, Settings2 } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import type { MediaEntry } from '@/types/media'
import type { OwnerListDocument, PublicListDocument, SystemListConfig, SystemListType } from '@/types/public'
import type { UserProfile } from '@/lib/firebase/firestore'
import { updateUserProfile } from '@/lib/firebase/firestore'
import { deletePublicList, getOwnerLists, publishSystemList } from '@/lib/firebase/publicSharing'
import { useAuthStore } from '@/store/authStore'
import { deriveSystemListEntries, getSystemListConfig, resolveSystemListEntries, SYSTEM_LISTS } from '@/utils/systemLists'
import { isEntryPublic, normalizePublicVisibility } from '@/utils/publicVisibility'

export function MyLists({ entries, loading, profile, onProfileChange }: { entries: MediaEntry[]; loading: boolean; profile: UserProfile; onProfileChange: (profile: UserProfile) => void }) {
  const { user } = useAuthStore()
  const [customLists, setCustomLists] = useState<OwnerListDocument[]>([])
  const [saving, setSaving] = useState<SystemListType | null>(null)
  useEffect(() => {
    if (!user || loading) return
    getOwnerLists(user.uid, profile.publicUsername, entries).then(setCustomLists).catch(() => {})
  }, [user, loading, profile.publicUsername, entries])

  const systemRows = useMemo(() => SYSTEM_LISTS.map((definition) => {
    const config = getSystemListConfig(profile.systemLists, definition.type)
    return { definition, config, entries: resolveSystemListEntries(definition.type, config, entries) }
  }), [entries, profile.systemLists])

  async function saveConfig(type: SystemListType, next: SystemListConfig) {
    if (!user) return
    setSaving(type)
    const nextProfile: UserProfile = { ...profile, systemLists: { ...(profile.systemLists ?? {}), [type]: next } }
    try {
      await updateUserProfile(user.uid, { systemLists: nextProfile.systemLists })
      const definition = SYSTEM_LISTS.find((item) => item.type === type)!
      if (profile.publicUsername) {
        if (next.visibility === 'private') {
          await deletePublicList(profile.publicUsername, type).catch(() => {})
        } else {
          const resolved = resolveSystemListEntries(type, next, entries)
          const visible = resolved.filter((entry) => isEntryPublic(entry, profile.publicProfileEnabled, normalizePublicVisibility(profile.publicVisibility)))
          const publicIds = visible.map((entry) => entry.publicId).filter((id): id is string => !!id)
          const mirror: Omit<PublicListDocument, 'createdAt' | 'updatedAt'> = {
            slug: type,
            name: definition.name,
            description: definition.description,
            visibility: 'public',
            kind: 'system',
            systemType: type,
            autoUpdate: next.autoUpdate,
            titleCount: publicIds.length,
            titleIds: next.autoUpdate ? [] : publicIds,
          }
          await publishSystemList(profile.publicUsername, mirror)
        }
      }
      onProfileChange(nextProfile)
      toast.success(`${definition.name} updated.`)
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Could not update list.')
    } finally { setSaving(null) }
  }

  function toggleAuto(type: SystemListType, current: SystemListConfig) {
    if (!current.autoUpdate) {
      if (!confirm('Turning Auto Update back on will synchronize this list with its system definition. Manual list changes may be replaced.')) return
      saveConfig(type, { ...current, autoUpdate: true, snapshotEntryIds: [] })
      return
    }
    const snapshotEntryIds = deriveSystemListEntries(type, entries).map((entry) => entry.id).filter((id): id is string => !!id)
    saveConfig(type, { ...current, autoUpdate: false, snapshotEntryIds })
  }

  return <section>
    <div className="mb-3 flex items-end justify-between gap-3"><div><h3 className="text-xs font-semibold uppercase tracking-wider text-white/40">My Lists</h3><p className="mt-1 text-xs text-white/30">System lists update automatically; custom lists remain fully user managed.</p></div><Button size="sm" variant="outline" asChild><Link href="/public-profile"><Settings2 className="mr-1.5 h-3.5 w-3.5" />Manage Custom</Link></Button></div>
    <p className="mb-2 text-[10px] font-semibold uppercase text-white/30">System Lists</p>
    <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">{systemRows.map(({ definition, config, entries: listEntries }) => <div key={definition.type} className="rounded-lg border border-white/10 bg-white/[0.03] p-3">
      <Link href={`/lists/${definition.type}`} className="block rounded focus:outline-none focus:ring-2 focus:ring-blue-500/50"><div className="flex items-start gap-2"><div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-blue-500/10"><Folder className="h-4 w-4 text-blue-300" /></div><div className="min-w-0 flex-1"><p className="truncate text-sm font-semibold text-white">{definition.name}</p><p className="text-xs text-white/35">{listEntries.length} title{listEntries.length === 1 ? '' : 's'}</p></div></div></Link>
      <div className="mt-3 flex items-center justify-between gap-2 border-t border-white/5 pt-2"><button disabled={saving === definition.type} onClick={() => saveConfig(definition.type, { ...config, visibility: config.visibility === 'public' ? 'private' : 'public' })} className="inline-flex items-center gap-1 text-xs text-white/45 hover:text-white">{config.visibility === 'public' ? <Globe2 className="h-3.5 w-3.5 text-emerald-300" /> : <Lock className="h-3.5 w-3.5" />}{config.visibility === 'public' ? 'Public' : 'Private'}</button><button disabled={saving === definition.type} onClick={() => toggleAuto(definition.type, config)} className="inline-flex items-center gap-1 text-xs text-white/45 hover:text-white"><RefreshCw className={`h-3.5 w-3.5 ${config.autoUpdate ? 'text-blue-300' : ''}`} />Auto Update: {config.autoUpdate ? 'ON' : 'OFF'}</button></div>
    </div>)}</div>
    <div className="mt-4 flex items-center justify-between"><p className="text-[10px] font-semibold uppercase text-white/30">Custom Lists</p><span className="text-[10px] text-white/25">{customLists.length}</span></div>
    {customLists.length ? <div className="mt-2 grid gap-2 sm:grid-cols-2 xl:grid-cols-3">{customLists.map((list) => <Link key={list.slug} href={`/lists/${list.slug}`} className="rounded-lg border border-white/10 bg-white/[0.025] p-3 transition hover:border-white/20"><div className="flex items-center gap-2"><Folder className="h-4 w-4 text-purple-300" /><p className="min-w-0 flex-1 truncate text-sm font-medium text-white">{list.name}</p>{list.visibility === 'public' ? <Globe2 className="h-3.5 w-3.5 text-emerald-300" /> : <Lock className="h-3.5 w-3.5 text-white/30" />}</div><p className="mt-1 text-xs text-white/35">{list.entryIds.length} title{list.entryIds.length === 1 ? '' : 's'}</p></Link>)}</div> : <p className="mt-2 rounded-lg border border-dashed border-white/10 p-4 text-center text-xs text-white/30">No custom lists yet. Create one in Privacy &amp; Sharing.</p>}
  </section>
}
