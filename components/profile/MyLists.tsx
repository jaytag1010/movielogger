'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { ArrowDown, ArrowUp, Folder, FolderPlus, Pencil, Trash2 } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import type { MediaEntry } from '@/types/media'
import type { OwnerListDocument, SystemListConfig, SystemListType } from '@/types/public'
import type { UserProfile } from '@/lib/firebase/firestore'
import { updateUserProfile } from '@/lib/firebase/firestore'
import { deleteOwnerList, getOwnerLists, rebuildPublicLibrary, saveOwnerList } from '@/lib/firebase/publicSharing'
import { useAuthStore } from '@/store/authStore'
import { deriveSystemListEntries, getSystemListConfig, resolveSystemListEntries, SYSTEM_LISTS } from '@/utils/systemLists'
import { getDisplayTitle } from '@/utils/formatters'

interface Props {
  entries: MediaEntry[]
  loading: boolean
  profile: UserProfile
  onProfileChange: (profile: UserProfile) => void
}

export function MyLists({ entries, loading, profile, onProfileChange }: Props) {
  const { user } = useAuthStore()
  const [customFolders, setCustomFolders] = useState<OwnerListDocument[]>([])
  const [savingSystem, setSavingSystem] = useState<SystemListType | null>(null)
  const [editorOpen, setEditorOpen] = useState(false)
  const [editing, setEditing] = useState<OwnerListDocument | null>(null)
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [visibility, setVisibility] = useState<'private' | 'public'>('private')
  const [entryIds, setEntryIds] = useState<string[]>([])
  const [search, setSearch] = useState('')
  const [savingCustom, setSavingCustom] = useState(false)

  useEffect(() => {
    if (!user || loading) return
    getOwnerLists(user.uid, profile.publicUsername, entries).then(setCustomFolders).catch(() => {})
  }, [user, loading, profile.publicUsername, entries])

  const systemRows = useMemo(() => SYSTEM_LISTS.map((definition) => {
    const config = getSystemListConfig(profile.systemLists, definition.type)
    return { definition, config, entries: resolveSystemListEntries(definition.type, config, entries) }
  }), [entries, profile.systemLists])
  const byId = useMemo(() => new Map(entries.filter((entry) => entry.id).map((entry) => [entry.id!, entry])), [entries])
  const searchResults = useMemo(() => {
    const needle = search.trim().toLocaleLowerCase()
    if (!needle) return []
    return entries.filter((entry) => entry.id && getDisplayTitle(entry).toLocaleLowerCase().includes(needle)).slice(0, 40)
  }, [entries, search])

  async function saveSystemConfig(type: SystemListType, next: SystemListConfig) {
    if (!user) return
    setSavingSystem(type)
    const nextProfile: UserProfile = { ...profile, systemLists: { ...(profile.systemLists ?? {}), [type]: next } }
    try {
      await updateUserProfile(user.uid, { systemLists: nextProfile.systemLists })
      if (nextProfile.publicUsername) await rebuildPublicLibrary(user.uid, entries, nextProfile)
      onProfileChange(nextProfile)
      toast.success(`${SYSTEM_LISTS.find((item) => item.type === type)!.name} updated.`)
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Could not update folder.')
    } finally { setSavingSystem(null) }
  }

  function toggleAuto(type: SystemListType, current: SystemListConfig) {
    if (!current.autoUpdate) {
      if (!confirm('Turning Auto Update back on will synchronize this folder with its automatic definition. Manual changes may be replaced.')) return
      saveSystemConfig(type, { ...current, autoUpdate: true, snapshotEntryIds: [] })
      return
    }
    const snapshotEntryIds = deriveSystemListEntries(type, entries).map((entry) => entry.id).filter((id): id is string => !!id)
    saveSystemConfig(type, { ...current, autoUpdate: false, snapshotEntryIds })
  }

  function openCreate() {
    setEditing(null); setName(''); setDescription(''); setVisibility('private'); setEntryIds([]); setSearch(''); setEditorOpen(true)
  }

  function openEdit(folder: OwnerListDocument) {
    setEditing(folder); setName(folder.name); setDescription(folder.description); setVisibility(folder.visibility); setEntryIds(folder.entryIds); setSearch(''); setEditorOpen(true)
  }

  function toggleEntry(id: string) {
    setEntryIds((current) => current.includes(id) ? current.filter((item) => item !== id) : [...current, id])
  }

  function moveEntry(index: number, delta: number) {
    setEntryIds((current) => {
      const target = index + delta
      if (target < 0 || target >= current.length) return current
      const next = [...current]
      ;[next[index], next[target]] = [next[target], next[index]]
      return next
    })
  }

  async function saveCustomFolder() {
    if (!user || !name.trim()) { toast.error('Enter a folder name.'); return }
    setSavingCustom(true)
    try {
      const saved = await saveOwnerList(user.uid, profile.publicUsername, {
        slug: editing?.slug,
        name: name.trim(), description: description.trim(), visibility,
        kind: 'custom', systemType: null, autoUpdate: false,
        titleCount: entryIds.length, titleIds: [], entryIds,
      }, entries, profile)
      setCustomFolders((current) => [...current.filter((item) => item.slug !== saved.slug), saved])
      setEditorOpen(false)
      toast.success(editing ? 'Folder updated.' : 'Folder created.')
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Could not save folder.')
    } finally { setSavingCustom(false) }
  }

  async function setCustomVisibility(folder: OwnerListDocument, nextVisibility: 'public' | 'private') {
    if (!user) return
    try {
      const saved = await saveOwnerList(user.uid, profile.publicUsername, { ...folder, slug: folder.slug, visibility: nextVisibility }, entries, profile)
      setCustomFolders((current) => current.map((item) => item.slug === saved.slug ? saved : item))
      toast.success(`${folder.name} is now ${nextVisibility}.`)
    } catch { toast.error('Could not update folder visibility.') }
  }

  async function removeCustomFolder(folder: OwnerListDocument) {
    if (!user || !confirm(`Delete “${folder.name}”? Library titles will not be deleted.`)) return
    try {
      await deleteOwnerList(user.uid, profile.publicUsername, folder.slug, entries, profile)
      setCustomFolders((current) => current.filter((item) => item.slug !== folder.slug))
      toast.success('Folder deleted.')
    } catch { toast.error('Could not delete folder.') }
  }

  return <section>
    <div className="mb-4 flex flex-wrap items-end justify-between gap-3"><div><h3 className="text-xs font-semibold uppercase tracking-wider text-white/40">Folder Visibility</h3><p className="mt-1 text-xs text-white/30">Only folders marked Public appear on your public profile.</p></div><Button size="sm" onClick={openCreate}><FolderPlus className="mr-1.5 h-4 w-4" />Create Folder</Button></div>
    <p className="mb-2 text-[10px] font-semibold uppercase text-white/30">Automatic Folders</p>
    <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">{systemRows.map(({ definition, config, entries: folderEntries }) => <div key={definition.type} className="rounded-lg border border-white/10 bg-white/[0.03] p-3">
      <div className="flex items-start gap-2"><Link href={`/lists/${definition.type}`} className="flex min-w-0 flex-1 items-start gap-2 rounded focus:outline-none focus:ring-2 focus:ring-blue-500/50"><span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-blue-500/10"><Folder className="h-4 w-4 text-blue-300" /></span><span className="min-w-0"><span className="block truncate text-sm font-semibold text-white">{definition.name}</span><span className="text-xs text-white/35">{folderEntries.length} title{folderEntries.length === 1 ? '' : 's'}</span></span></Link></div>
      <div className="mt-3 grid grid-cols-2 gap-2 border-t border-white/5 pt-2"><label className="text-[10px] uppercase text-white/30">Privacy<select disabled={savingSystem === definition.type} value={config.visibility} onChange={(event) => saveSystemConfig(definition.type, { ...config, visibility: event.target.value as 'public' | 'private' })} className="mt-1 h-8 w-full rounded border border-white/10 bg-[#11131d] px-2 text-xs normal-case text-white"><option value="private">Private</option><option value="public">Public</option></select></label><label className="text-[10px] uppercase text-white/30">Auto-Update<select disabled={savingSystem === definition.type} value={config.autoUpdate ? 'on' : 'off'} onChange={() => toggleAuto(definition.type, config)} className="mt-1 h-8 w-full rounded border border-white/10 bg-[#11131d] px-2 text-xs normal-case text-white"><option value="on">On</option><option value="off">Off</option></select></label></div>
    </div>)}</div>
    <div className="mt-5 flex items-center justify-between"><p className="text-[10px] font-semibold uppercase text-white/30">Custom Folders</p><span className="text-[10px] text-white/25">{customFolders.length}</span></div>
    {customFolders.length ? <div className="mt-2 grid gap-2 sm:grid-cols-2 xl:grid-cols-3">{customFolders.map((folder) => <div key={folder.slug} className="rounded-lg border border-white/10 bg-white/[0.025] p-3"><div className="flex items-center gap-2"><Link href={`/lists/${folder.slug}`} className="flex min-w-0 flex-1 items-center gap-2"><Folder className="h-4 w-4 shrink-0 text-purple-300" /><span className="min-w-0"><span className="block truncate text-sm font-medium text-white">{folder.name}</span><span className="text-xs text-white/35">{folder.entryIds.length} title{folder.entryIds.length === 1 ? '' : 's'}</span></span></Link><Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => openEdit(folder)} title="Edit folder"><Pencil className="h-3.5 w-3.5" /></Button><Button size="icon" variant="ghost" className="h-7 w-7 text-red-300" onClick={() => removeCustomFolder(folder)} title="Delete folder"><Trash2 className="h-3.5 w-3.5" /></Button></div><label className="mt-3 block border-t border-white/5 pt-2 text-[10px] uppercase text-white/30">Privacy<select value={folder.visibility} onChange={(event) => setCustomVisibility(folder, event.target.value as 'public' | 'private')} className="mt-1 h-8 w-full rounded border border-white/10 bg-[#11131d] px-2 text-xs normal-case text-white"><option value="private">Private</option><option value="public">Public</option></select></label></div>)}</div> : <p className="mt-2 rounded-lg border border-dashed border-white/10 p-4 text-center text-xs text-white/30">No custom folders yet.</p>}
    <Dialog open={editorOpen} onOpenChange={(open) => { if (!savingCustom) setEditorOpen(open) }}><DialogContent className="max-w-2xl"><DialogHeader><DialogTitle>{editing ? `Edit ${editing.name}` : 'Create Folder'}</DialogTitle><DialogDescription>Custom folders are manually curated and default to Private.</DialogDescription></DialogHeader><div className="grid gap-3 sm:grid-cols-2"><Input value={name} onChange={(event) => setName(event.target.value)} placeholder="Folder name" /><label className="text-xs text-white/40">Privacy<select value={visibility} onChange={(event) => setVisibility(event.target.value as 'public' | 'private')} className="mt-1 h-10 w-full rounded-lg border border-white/10 bg-[#11131d] px-3 text-sm text-white"><option value="private">Private</option><option value="public">Public</option></select></label></div><Textarea rows={2} value={description} onChange={(event) => setDescription(event.target.value)} placeholder="Description (optional)" /><Input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search your library to add titles…" />{searchResults.length > 0 && <div className="max-h-40 overflow-y-auto rounded-lg border border-white/10">{searchResults.map((entry) => <button key={entry.id} onClick={() => toggleEntry(entry.id!)} className="flex w-full items-center justify-between border-b border-white/5 px-3 py-2 text-left text-sm last:border-0 hover:bg-white/5"><span className="truncate">{getDisplayTitle(entry)}</span><span className="ml-2 text-xs text-blue-300">{entryIds.includes(entry.id!) ? 'Remove' : 'Add'}</span></button>)}</div>}<div className="max-h-64 space-y-1 overflow-y-auto">{entryIds.map((id, index) => { const entry = byId.get(id); return <div key={id} className="flex items-center gap-2 rounded-lg bg-white/[0.035] px-2 py-1.5"><span className="w-6 text-center text-xs text-white/30">{index + 1}</span><span className="min-w-0 flex-1 truncate text-xs text-white/70">{entry ? getDisplayTitle(entry) : 'Unavailable title'}</span><button onClick={() => moveEntry(index, -1)} disabled={index === 0}><ArrowUp className="h-3.5 w-3.5" /></button><button onClick={() => moveEntry(index, 1)} disabled={index === entryIds.length - 1}><ArrowDown className="h-3.5 w-3.5" /></button><button onClick={() => toggleEntry(id)} className="px-1 text-red-300">×</button></div> })}</div><Button onClick={saveCustomFolder} disabled={savingCustom}>{savingCustom ? 'Saving…' : editing ? 'Save Folder' : 'Create Folder'}</Button></DialogContent></Dialog>
  </section>
}
