'use client'

import { useEffect, useMemo, useState } from 'react'
import { ArrowDown, ArrowUp, Copy, ExternalLink, Globe2, ListPlus, Loader2, Save, Trash2 } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { GlassCard } from '@/components/common/GlassCard'
import { useAuthStore } from '@/store/authStore'
import { useMedia } from '@/hooks/useMedia'
import { getUserProfile, UserProfile } from '@/lib/firebase/firestore'
import {
  deleteOwnerList,
  getOwnerLists,
  saveOwnerList,
  savePublicProfileSettings,
  validatePublicUsername,
} from '@/lib/firebase/publicSharing'
import { addActivity } from '@/lib/firebase/activity'
import { DEFAULT_PUBLIC_VISIBILITY, OwnerListDocument, PublicVisibilitySettings } from '@/types/public'
import { MEDIA_STATUS_LABELS, MediaEntry, MediaStatus, MediaType } from '@/types/media'
import { getDisplayTitle, getEffectiveMediaType, getMediaTypeLabel } from '@/utils/formatters'
import { isEntryPublic, normalizePublicVisibility } from '@/utils/publicVisibility'

const STATUS_ORDER: MediaStatus[] = ['completed', 'watching', 'planned', 'on_hold', 'dropped']
const TYPE_ORDER: MediaType[] = ['movie', 'series', 'shorts']

const EMPTY_PROFILE: UserProfile = {
  displayName: null,
  profilePhotoUrl: null,
  bio: '',
  publicProfileEnabled: false,
  publicUsername: null,
  showPublicStats: false,
  publicVisibility: DEFAULT_PUBLIC_VISIBILITY,
  systemLists: {},
}

export function PublicProfileSettings() {
  const { user } = useAuthStore()
  const { entries, loading: mediaLoading, loadEntries } = useMedia()
  const [profile, setProfile] = useState<UserProfile>(EMPTY_PROFILE)
  const [username, setUsername] = useState('')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [lists, setLists] = useState<OwnerListDocument[]>([])

  useEffect(() => {
    if (!user || mediaLoading) return
    getUserProfile(user.uid)
      .then(async (value) => {
        setProfile(value)
        setUsername(value.publicUsername ?? '')
        setLists(await getOwnerLists(user.uid, value.publicUsername, entries))
      })
      .catch(() => toast.error('Could not load public profile settings.'))
      .finally(() => setLoading(false))
  }, [user, mediaLoading])

  function setStatusVisibility(status: MediaStatus, checked: boolean) {
    setProfile((current) => ({
      ...current,
      publicVisibility: {
        ...normalizePublicVisibility(current.publicVisibility),
        statuses: { ...normalizePublicVisibility(current.publicVisibility).statuses, [status]: checked },
      },
    }))
  }

  function setTypeVisibility(type: MediaType, checked: boolean) {
    setProfile((current) => ({
      ...current,
      publicVisibility: {
        ...normalizePublicVisibility(current.publicVisibility),
        types: { ...normalizePublicVisibility(current.publicVisibility).types, [type]: checked },
      },
    }))
  }

  async function handleSave() {
    if (!user) return
    const usernameError = validatePublicUsername(username)
    if (usernameError) { toast.error(usernameError); return }
    setSaving(true)
    try {
      const beforeEnabled = profile.publicProfileEnabled
      const saved = await savePublicProfileSettings(user.uid, entries, {
        publicProfileEnabled: profile.publicProfileEnabled,
        publicUsername: username,
        displayName: profile.displayName || user.displayName || username,
        profilePhotoUrl: profile.profilePhotoUrl || user.photoURL || null,
        bio: profile.bio,
        showPublicStats: profile.showPublicStats,
        publicVisibility: normalizePublicVisibility(profile.publicVisibility),
      }, profile.publicUsername)
      setProfile(saved)
      setUsername(saved.publicUsername ?? username)
      await loadEntries()
      setLists(await getOwnerLists(user.uid, saved.publicUsername, entries))
      if (beforeEnabled !== saved.publicProfileEnabled) {
        addActivity(user.uid, {
          category: 'system',
          action: saved.publicProfileEnabled ? 'Public Profile Enabled' : 'Public Profile Disabled',
          summary: saved.publicProfileEnabled
            ? `Public profile @${saved.publicUsername} was enabled.`
            : `Public profile @${saved.publicUsername} was disabled.`,
        }).catch(() => {})
      }
      const savedPublicCount = entries.filter((entry) => isEntryPublic(entry, saved.publicProfileEnabled, normalizePublicVisibility(saved.publicVisibility))).length
      toast.success(saved.publicProfileEnabled
        ? `${savedPublicCount} title${savedPublicCount === 1 ? '' : 's'} published.`
        : 'Public profile settings saved. Your public content is inaccessible.')
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Could not save public profile.')
    } finally {
      setSaving(false)
    }
  }

  function publicUrl(path = '') {
    if (typeof window === 'undefined' || !profile.publicUsername) return ''
    return `${window.location.origin}/u/${profile.publicUsername}${path}`
  }

  async function copyProfileLink() {
    await navigator.clipboard.writeText(publicUrl())
    toast.success('Public profile link copied.')
  }

  if (loading) return <div className="py-20 text-center text-sm text-white/45">Loading privacy settings…</div>

  return (
    <div className="space-y-4">
      <GlassCard padding="md">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 className="text-lg font-semibold text-white">Public Profile</h2>
            <p className="mt-1 text-sm text-white/45">Everything remains private until this master switch is enabled.</p>
          </div>
          <Toggle checked={profile.publicProfileEnabled} onChange={(checked) => setProfile((value) => ({ ...value, publicProfileEnabled: checked }))} label="Public Profile" />
        </div>

        <div className="mt-5 grid gap-4 sm:grid-cols-2">
          <Field label="Public Username" hint="Letters, numbers, and underscores. Used in your public URL.">
            <div className="flex items-center rounded-lg border border-white/10 bg-white/5 pl-3 focus-within:border-blue-500/40">
              <span className="text-sm text-white/35">/u/</span>
              <Input value={username} onChange={(event) => setUsername(event.target.value.toLowerCase())} className="border-0 bg-transparent" placeholder="your_username" />
            </div>
          </Field>
          <Field label="Display Name">
            <Input value={profile.displayName ?? ''} onChange={(event) => setProfile((value) => ({ ...value, displayName: event.target.value }))} placeholder="Name shown publicly" />
          </Field>
        </div>
        <div className="mt-4">
          <Field label="Short Bio">
            <Textarea maxLength={240} rows={3} value={profile.bio} onChange={(event) => setProfile((value) => ({ ...value, bio: event.target.value }))} placeholder="A short introduction for visitors…" />
          </Field>
        </div>
      </GlassCard>

      <GlassCard padding="md">
        <h2 className="text-base font-semibold text-white">Library Visibility</h2>
        <p className="mt-1 text-xs text-white/40">Inherited titles are public only when both their status and media type are enabled.</p>
        <div className="mt-4 grid gap-5 sm:grid-cols-2">
          <div>
            <p className="mb-2 text-xs font-semibold uppercase text-white/35">Statuses</p>
            <div className="space-y-2">
              {STATUS_ORDER.map((status) => <Toggle key={status} checked={profile.publicVisibility.statuses[status]} onChange={(checked) => setStatusVisibility(status, checked)} label={MEDIA_STATUS_LABELS[status]} />)}
            </div>
          </div>
          <div>
            <p className="mb-2 text-xs font-semibold uppercase text-white/35">Media Types</p>
            <div className="space-y-2">
              {TYPE_ORDER.map((type) => <Toggle key={type} checked={profile.publicVisibility.types[type]} onChange={(checked) => setTypeVisibility(type, checked)} label={`${getMediaTypeLabel(type)}${type === 'movie' ? 's' : ''}`} />)}
            </div>
          </div>
        </div>
        <div className="mt-5 border-t border-white/10 pt-4">
          <Toggle checked={profile.showPublicStats} onChange={(checked) => setProfile((value) => ({ ...value, showPublicStats: checked }))} label="Show Public Statistics" description="Calculated only from titles eligible for public display." />
        </div>
      </GlassCard>

      <PublicListsManager
        entries={entries}
        lists={lists}
        username={profile.publicUsername}
        profileEnabled={profile.publicProfileEnabled}
        visibility={profile.publicVisibility}
        onListsChange={setLists}
      />

      <GlassCard padding="md">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="text-base font-semibold text-white">Sharing</h2>
            <p className="mt-1 text-xs text-white/40">Preview uses the same public route and Firestore permissions as an anonymous visitor.</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" disabled={!profile.publicUsername} onClick={copyProfileLink}><Copy className="mr-2 h-4 w-4" />Copy Link</Button>
            <Button variant="outline" disabled={!profile.publicUsername} asChild>
              <a href={publicUrl()} target="_blank" rel="noreferrer"><ExternalLink className="mr-2 h-4 w-4" />View Public Profile</a>
            </Button>
          </div>
        </div>
      </GlassCard>

      <Button size="lg" className="w-full" onClick={handleSave} disabled={saving}>
        {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
        Save Privacy & Sharing Settings
      </Button>
    </div>
  )
}

function PublicListsManager({ entries, lists, username, profileEnabled, visibility, onListsChange }: {
  entries: MediaEntry[]
  lists: OwnerListDocument[]
  username: string | null
  profileEnabled: boolean
  visibility: PublicVisibilitySettings
  onListsChange: (lists: OwnerListDocument[]) => void
}) {
  const { user } = useAuthStore()
  const [editing, setEditing] = useState<OwnerListDocument | null>(null)
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [isPublic, setIsPublic] = useState(false)
  const [titleIds, setTitleIds] = useState<string[]>([])
  const [search, setSearch] = useState('')
  const [saving, setSaving] = useState(false)

  const byEntryId = useMemo(() => new Map(entries.filter((entry) => entry.id).map((entry) => [entry.id!, entry])), [entries])
  const searchResults = useMemo(() => {
    const needle = search.trim().toLocaleLowerCase()
    if (!needle) return []
    return entries.filter((entry) => entry.id && getDisplayTitle(entry).toLocaleLowerCase().includes(needle)).slice(0, 30)
  }, [entries, search])
  const privateInList = titleIds.filter((id) => {
    const entry = byEntryId.get(id)
    return entry && !isEntryPublic(entry, profileEnabled, normalizePublicVisibility(visibility))
  }).length

  function resetForm() {
    setEditing(null); setName(''); setDescription(''); setIsPublic(false); setTitleIds([]); setSearch('')
  }

  function editList(list: OwnerListDocument) {
    setEditing(list); setName(list.name); setDescription(list.description); setIsPublic(list.visibility === 'public'); setTitleIds(list.entryIds); setSearch('')
  }

  function toggleTitle(entryId: string) {
    setTitleIds((current) => current.includes(entryId) ? current.filter((id) => id !== entryId) : [...current, entryId])
  }

  function move(index: number, delta: number) {
    setTitleIds((current) => {
      const next = [...current]
      const target = index + delta
      if (target < 0 || target >= next.length) return current
      ;[next[index], next[target]] = [next[target], next[index]]
      return next
    })
  }

  async function saveList() {
    if (!username) { toast.error('Save a public username first.'); return }
    if (!name.trim()) { toast.error('Enter a list name.'); return }
    setSaving(true)
    try {
      if (!user) return
      const saved = await saveOwnerList(user.uid, username, {
        slug: editing?.slug,
        name: name.trim(),
        description: description.trim(),
        visibility: isPublic ? 'public' : 'private',
        kind: 'custom',
        systemType: null,
        autoUpdate: false,
        titleCount: titleIds.length,
        titleIds: [],
        entryIds: titleIds,
      }, entries, { ...profileFromProps(profileEnabled, visibility), publicUsername: username })
      onListsChange([...lists.filter((list) => list.slug !== saved.slug), saved])
      if (user) addActivity(user.uid, { category: 'library', action: editing ? 'Public List Edited' : 'Public List Created', summary: `${saved.name} was ${editing ? 'updated' : 'created'}.` }).catch(() => {})
      toast.success(editing ? 'List updated.' : 'List created.')
      resetForm()
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Could not save list.')
    } finally { setSaving(false) }
  }

  async function removeList(list: OwnerListDocument) {
    if (!user || !confirm(`Delete “${list.name}”?`)) return
    await deleteOwnerList(user.uid, username, list.slug)
    onListsChange(lists.filter((item) => item.slug !== list.slug))
    if (user) addActivity(user.uid, { category: 'library', action: 'Public List Deleted', summary: `${list.name} was deleted.` }).catch(() => {})
    toast.success('List deleted.')
  }

  return (
    <GlassCard padding="md">
      <div className="flex items-center gap-2"><ListPlus className="h-4 w-4 text-blue-300" /><h2 className="text-base font-semibold text-white">Public Lists</h2></div>
      <p className="mt-1 text-xs text-white/40">Lists default to private. Public lists never reveal titles that resolve to private.</p>
      {lists.length > 0 && <div className="mt-4 space-y-2">{lists.map((list) => (
        <div key={list.slug} className="flex items-center gap-3 rounded-lg border border-white/10 bg-white/[0.025] p-3">
          <div className="min-w-0 flex-1"><p className="truncate text-sm font-medium text-white">{list.name}</p><p className="text-xs text-white/35">{list.entryIds.length} titles · {list.visibility === 'public' ? 'Public' : 'Private'}</p></div>
          <Button size="sm" variant="ghost" onClick={() => editList(list)}>Edit</Button>
          <Button size="sm" variant="ghost" className="text-red-300" onClick={() => removeList(list)}><Trash2 className="h-4 w-4" /></Button>
        </div>
      ))}</div>}

      <div className="mt-4 rounded-xl border border-white/10 bg-white/[0.02] p-3">
        <p className="text-sm font-semibold text-white">{editing ? `Edit ${editing.name}` : 'Create a List'}</p>
        <div className="mt-3 grid gap-3 sm:grid-cols-2"><Input value={name} onChange={(event) => setName(event.target.value)} placeholder="List name" /><Toggle checked={isPublic} onChange={setIsPublic} label="Public List" /></div>
        <Textarea className="mt-3" rows={2} value={description} onChange={(event) => setDescription(event.target.value)} placeholder="Description (optional)" />
        <Input className="mt-3" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search your library to add titles…" />
        {searchResults.length > 0 && <div className="mt-2 max-h-48 overflow-y-auto rounded-lg border border-white/10">{searchResults.map((entry) => (
          <button key={entry.id} type="button" onClick={() => toggleTitle(entry.id!)} className="flex w-full items-center justify-between border-b border-white/5 px-3 py-2 text-left text-sm text-white/70 last:border-0 hover:bg-white/5"><span className="truncate">{getDisplayTitle(entry)}</span><span className="ml-2 text-xs text-blue-300">{titleIds.includes(entry.id!) ? 'Added' : 'Add'}</span></button>
        ))}</div>}
        {titleIds.length > 0 && <div className="mt-3 space-y-1">{titleIds.map((id, index) => {
          const entry = byEntryId.get(id)
          return <div key={id} className="flex items-center gap-2 rounded-lg bg-white/[0.035] px-2 py-1.5"><span className="w-6 text-center text-xs text-white/30">{index + 1}</span><span className="min-w-0 flex-1 truncate text-xs text-white/70">{entry ? getDisplayTitle(entry) : 'Unavailable title'}</span><button onClick={() => move(index, -1)} disabled={index === 0}><ArrowUp className="h-3.5 w-3.5" /></button><button onClick={() => move(index, 1)} disabled={index === titleIds.length - 1}><ArrowDown className="h-3.5 w-3.5" /></button><button onClick={() => toggleTitle(id)} className="text-red-300">×</button></div>
        })}</div>}
        {isPublic && privateInList > 0 && <p className="mt-3 rounded-lg border border-amber-500/20 bg-amber-500/10 px-3 py-2 text-xs text-amber-200">{privateInList} title{privateInList === 1 ? ' is' : 's are'} private and will not appear to public viewers.</p>}
        <div className="mt-3 flex gap-2"><Button onClick={saveList} disabled={saving}>{saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}{editing ? 'Save List' : 'Create List'}</Button>{editing && <Button variant="ghost" onClick={resetForm}>Cancel</Button>}</div>
      </div>
    </GlassCard>
  )
}

function profileFromProps(enabled: boolean, visibility: PublicVisibilitySettings): UserProfile {
  return { displayName: null, profilePhotoUrl: null, bio: '', publicProfileEnabled: enabled, publicUsername: null, showPublicStats: false, publicVisibility: visibility, systemLists: {} }
}

function Toggle({ checked, onChange, label, description }: { checked: boolean; onChange: (checked: boolean) => void; label: string; description?: string }) {
  return <label className="flex cursor-pointer items-center justify-between gap-3 rounded-lg border border-white/10 bg-white/[0.025] px-3 py-2.5"><span><span className="block text-sm text-white/75">{label}</span>{description && <span className="block text-xs text-white/35">{description}</span>}</span><input type="checkbox" checked={checked} onChange={(event) => onChange(event.target.checked)} className="h-4 w-4 accent-blue-500" /></label>
}

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return <div className="space-y-1.5"><Label>{label}</Label>{children}{hint && <p className="text-xs text-white/30">{hint}</p>}</div>
}
