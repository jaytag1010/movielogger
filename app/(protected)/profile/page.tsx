'use client'

export const dynamic = 'force-dynamic'

import { useState, useEffect, useRef } from 'react'
import Link from 'next/link'
import { motion } from 'framer-motion'
import { toast } from 'sonner'
import {
  LogOut,
  FileSpreadsheet,
  FileText,
  Mail,
  Trash2,
  AlertTriangle,
  Upload,
  Camera,
  Pencil,
  X,
  Check,
  CalendarDays,
  Wrench,
  History,
  Copy,
  ExternalLink,
} from 'lucide-react'
import { AppLayout } from '@/components/layout/AppLayout'
import { GlassCard } from '@/components/common/GlassCard'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { useAuthStore } from '@/store/authStore'
import { useAuthActions } from '@/hooks/useAuth'
import { useMedia } from '@/hooks/useMedia'
import { useMediaStore } from '@/store/mediaStore'
import { useRouter } from 'next/navigation'
import { exportToExcel, exportToCSV } from '@/lib/export/exporter'
import { deleteAllUserEntries, getUserProfile, updateUserProfile, UserProfile } from '@/lib/firebase/firestore'
import { addActivity } from '@/lib/firebase/activity'
import { validatePosterFile, uploadPoster } from '@/lib/imgbb'
import { useActivityHistory } from '@/hooks/useActivityHistory'
import { DEFAULT_PUBLIC_VISIBILITY } from '@/types/public'
import { OverallSummary } from '@/components/profile/OverallSummary'
import { MyLists } from '@/components/profile/MyLists'
import { savePublicProfileSettings, validatePublicUsername } from '@/lib/firebase/publicSharing'

const CONFIRM_PHRASE = 'CONTINUE'

/** Format Firebase creationTime → "June 2025" */
function formatMemberSince(creationTime: string | undefined): string | null {
  if (!creationTime) return null
  try {
    return new Date(creationTime).toLocaleDateString('en-US', {
      month: 'long',
      year: 'numeric',
    })
  } catch {
    return null
  }
}

export default function ProfilePage() {
  const { user } = useAuthStore()
  const { logOut } = useAuthActions()
  const { entries, loading: mediaLoading } = useMedia()
  const { activities } = useActivityHistory()
  const { setEntries } = useMediaStore()
  const router = useRouter()

  // ── Profile customization state ──────────────────────────────────────────
  const [profile, setProfile] = useState<UserProfile>({
    displayName: null,
    profilePhotoUrl: null,
    bio: '',
    publicProfileEnabled: true,
    publicUsername: null,
    showPublicStats: false,
    publicVisibility: DEFAULT_PUBLIC_VISIBILITY,
    systemLists: {},
    publicSharingVersion: 3,
  })
  const [profileLoading, setProfileLoading] = useState(true)

  // Display name editing
  const [editingName, setEditingName] = useState(false)
  const [nameInput, setNameInput] = useState('')
  const [savingName, setSavingName] = useState(false)
  const [usernameInput, setUsernameInput] = useState('')
  const [bioInput, setBioInput] = useState('')
  const [savingUnifiedProfile, setSavingUnifiedProfile] = useState(false)
  const [savingSharing, setSavingSharing] = useState(false)

  // Photo upload
  const [uploadingPhoto, setUploadingPhoto] = useState(false)
  const [avatarVersion, setAvatarVersion] = useState(0)
  const [photoPreviewUrl, setPhotoPreviewUrl] = useState<string | null>(null)
  const photoInputRef = useRef<HTMLInputElement>(null)

  // ── Existing state ────────────────────────────────────────────────────────
  const [loggingOut, setLoggingOut] = useState(false)
  const [signOutDialogOpen, setSignOutDialogOpen] = useState(false)
  const [clearDialogOpen, setClearDialogOpen] = useState(false)
  const [confirmInput, setConfirmInput] = useState('')
  const [clearing, setClearing] = useState(false)

  // ── Load profile on mount ─────────────────────────────────────────────────
  useEffect(() => {
    if (!user) return
    getUserProfile(user.uid)
      .then((p) => {
        setProfile(p)
        setNameInput(p.displayName ?? user.displayName ?? '')
        setUsernameInput(p.publicUsername ?? '')
        setBioInput(p.bio ?? '')
      })
      .catch(() => {
        setNameInput(user.displayName ?? '')
      })
      .finally(() => setProfileLoading(false))
  }, [user])

  // ── Derived values ────────────────────────────────────────────────────────
  const effectiveDisplayName = profile.displayName || user?.displayName || 'Anonymous User'
  const rawPhotoUrl          = profile.profilePhotoUrl || user?.photoURL || ''
  const versionedPhotoUrl    = rawPhotoUrl && avatarVersion > 0
    ? `${rawPhotoUrl}${rawPhotoUrl.includes('?') ? '&' : '?'}mlv=${avatarVersion}`
    : rawPhotoUrl
  const effectivePhotoUrl    = photoPreviewUrl || versionedPhotoUrl
  const memberSince          = formatMemberSince(user?.metadata?.creationTime)
  const unmatchedCount       = entries.filter((entry) => entry.tmdbId == null && !entry.tmdbUnmatchedDismissedAt).length
  const lastScanMillis       = entries.reduce((latest, entry) => Math.max(latest, entry.tmdbLastCheckedAt?.toMillis() ?? 0), 0)
  const lastScan             = lastScanMillis > 0
    ? new Date(lastScanMillis).toLocaleString('en-US', {
        month: 'short',
        day: 'numeric',
        year: 'numeric',
        hour: 'numeric',
        minute: '2-digit',
      })
    : 'Never'
  const lastActivityMillis   = activities.reduce((latest, activity) => Math.max(latest, activity.createdAt?.toMillis?.() ?? 0), 0)
  const lastActivity         = lastActivityMillis > 0
    ? new Date(lastActivityMillis).toLocaleString('en-US', {
        month: 'short',
        day: 'numeric',
        year: 'numeric',
        hour: 'numeric',
        minute: '2-digit',
      })
    : 'Never'

  const initials = effectiveDisplayName
    .split(' ')
    .map((n) => n[0])
    .join('')
    .toUpperCase()
    .slice(0, 2) || 'U'
  const profileDirty = !profileLoading && (
    nameInput.trim() !== (profile.displayName ?? user?.displayName ?? '').trim() ||
    usernameInput.trim().toLocaleLowerCase() !== (profile.publicUsername ?? '') ||
    bioInput.trim() !== profile.bio.trim()
  )

  // ── Handlers ──────────────────────────────────────────────────────────────

  async function handleLogOut() {
    setLoggingOut(true)
    try {
      await logOut()
      setSignOutDialogOpen(false)
      router.replace('/login')
    } catch {
      toast.error('Failed to sign out')
      setLoggingOut(false)
    }
  }

  function handleExcelExport() {
    if (entries.length === 0) { toast.error('Nothing to export'); return }
    exportToExcel(entries)
    if (user) {
      addActivity(user.uid, {
        category: 'import_export',
        action: 'Export Excel',
        summary: `Exported ${entries.length} title${entries.length === 1 ? '' : 's'} to Excel.`,
        details: [{ label: 'Titles Exported', after: entries.length }],
      }).catch(() => {})
    }
    toast.success('Exported to Excel')
  }

  function handleCSVExport() {
    if (entries.length === 0) { toast.error('Nothing to export'); return }
    exportToCSV(entries)
    if (user) {
      addActivity(user.uid, {
        category: 'import_export',
        action: 'Export CSV',
        summary: `Exported ${entries.length} title${entries.length === 1 ? '' : 's'} to CSV.`,
        details: [{ label: 'Titles Exported', after: entries.length }],
      }).catch(() => {})
    }
    toast.success('Exported to CSV')
  }

  async function handleClearAllData() {
    if (!user || confirmInput !== CONFIRM_PHRASE) return
    setClearing(true)
    try {
      const deleted = await deleteAllUserEntries(user.uid)
      setEntries([])
      setClearDialogOpen(false)
      setConfirmInput('')
      toast.success(`Cleared ${deleted} entr${deleted === 1 ? 'y' : 'ies'} from your list`)
    } catch {
      toast.error('Failed to clear data. Please try again.')
    } finally {
      setClearing(false)
    }
  }

  /** Upload a new profile photo via ImgBB and persist the URL. */
  async function handlePhotoFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file || !user) return
    // Reset input so same file can be re-selected
    e.target.value = ''

    const previewUrl = URL.createObjectURL(file)
    setPhotoPreviewUrl(previewUrl)
    setUploadingPhoto(true)
    try {
      validatePosterFile(file)
      const url = await uploadPoster(file, `profile_${user.uid}`)
      if (!/^https:\/\//i.test(url)) throw new Error('Image host returned an invalid URL.')
      await new Promise<void>((resolve, reject) => {
        const image = new Image()
        image.onload = () => resolve()
        image.onerror = () => reject(new Error('The uploaded image could not be loaded.'))
        image.src = url
      })
      await updateUserProfile(user.uid, { profilePhotoUrl: url })
      const persisted = await getUserProfile(user.uid)
      if (persisted.profilePhotoUrl !== url) throw new Error('Profile photo could not be verified after saving.')
      setProfile(persisted)
      setAvatarVersion(Date.now())
      setPhotoPreviewUrl(null)
      toast.success('Profile photo updated')
    } catch (err) {
      console.error('Profile photo update failed', err)
      setPhotoPreviewUrl(null)
      toast.error(err instanceof Error ? err.message : 'Photo upload failed')
    } finally {
      URL.revokeObjectURL(previewUrl)
      setUploadingPhoto(false)
    }
  }

  /** Remove current profile photo (sets to null in Firestore). */
  async function handleRemovePhoto() {
    if (!user) return
    try {
      await updateUserProfile(user.uid, { profilePhotoUrl: null })
      const persisted = await getUserProfile(user.uid)
      if (persisted.profilePhotoUrl) throw new Error('Profile photo removal could not be verified.')
      setProfile(persisted)
      setAvatarVersion(Date.now())
      toast.success('Profile photo removed')
    } catch {
      toast.error('Failed to remove photo')
    }
  }

  /** Save custom display name to Firestore. */
  async function handleSaveName() {
    if (!user) return
    setSavingName(true)
    try {
      const trimmed = nameInput.trim() || null
      await updateUserProfile(user.uid, { displayName: trimmed })
      setProfile((prev) => ({ ...prev, displayName: trimmed }))
      // Keep the auth store in sync so Dashboard reflects the change instantly
      useAuthStore.getState().setProfileDisplayName(trimmed)
      setEditingName(false)
      toast.success('Display name updated')
    } catch {
      toast.error('Failed to save display name')
    } finally {
      setSavingName(false)
    }
  }

  async function persistUnifiedProfile(next: UserProfile): Promise<UserProfile> {
    if (!user) throw new Error('Not authenticated')
    const username = usernameInput.trim().toLocaleLowerCase()
    if (username) {
      const validation = validatePublicUsername(username)
      if (validation) throw new Error(validation)
      return savePublicProfileSettings(user.uid, entries, {
        publicUsername: username,
        displayName: next.displayName,
        profilePhotoUrl: next.profilePhotoUrl,
        bio: next.bio,
        showPublicStats: next.showPublicStats,
        publicVisibility: next.publicVisibility,
      }, profile.publicUsername)
    }
    await updateUserProfile(user.uid, {
      displayName: next.displayName,
      bio: next.bio,
      publicProfileEnabled: true,
      showPublicStats: next.showPublicStats,
      publicSharingVersion: 3,
    })
    return { ...next, publicProfileEnabled: true, publicUsername: null, publicSharingVersion: 3 }
  }

  async function handleSaveUnifiedProfile() {
    if (!user) return
    setSavingUnifiedProfile(true)
    try {
      const next = { ...profile, displayName: nameInput.trim() || null, bio: bioInput.trim() }
      const saved = await persistUnifiedProfile(next)
      setProfile(saved)
      setNameInput(saved.displayName ?? user.displayName ?? '')
      setUsernameInput(saved.publicUsername ?? '')
      setBioInput(saved.bio)
      useAuthStore.getState().setProfileDisplayName(saved.displayName)
      setEditingName(false)
      toast.success('Profile updated.')
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Could not update profile.')
    } finally { setSavingUnifiedProfile(false) }
  }

  async function handleSharingChange(updates: Partial<UserProfile>) {
    setSavingSharing(true)
    try {
      const saved = await persistUnifiedProfile({ ...profile, ...updates, bio: bioInput.trim(), displayName: nameInput.trim() || null })
      setProfile(saved)
      setUsernameInput(saved.publicUsername ?? '')
      toast.success('Public sharing updated.')
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Could not update public sharing.')
    } finally { setSavingSharing(false) }
  }

  async function copyPublicUrl() {
    if (!profile.publicUsername) return
    await navigator.clipboard.writeText(`${window.location.origin}/u/${profile.publicUsername}`)
    toast.success('Public profile link copied.')
  }

  function handleCancelName() {
    setNameInput(profile.displayName ?? user?.displayName ?? '')
    setEditingName(false)
  }

  return (
    <AppLayout title="Profile" subtitle="Account &amp; settings">
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        className="space-y-4"
      >

        {/* ── Section 1: Account ── */}
        <GlassCard padding="md">
          <h3 className="text-xs font-semibold text-white/40 uppercase tracking-wider mb-4">
            Account
          </h3>

          {/* Profile Photo */}
          <div className="flex flex-col items-center mb-5">
            <div className="relative">
              <Avatar className="w-20 h-20 border-2 border-white/10">
                <AvatarImage src={effectivePhotoUrl} />
                <AvatarFallback className="text-xl">{initials}</AvatarFallback>
              </Avatar>

              {/* Upload overlay button */}
              <button
                className="absolute inset-0 flex items-center justify-center rounded-full bg-black/50 opacity-0 hover:opacity-100 transition-opacity disabled:cursor-not-allowed"
                onClick={() => photoInputRef.current?.click()}
                disabled={uploadingPhoto}
                title="Change profile photo"
              >
                {uploadingPhoto ? (
                  <span className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                ) : (
                  <Camera className="w-5 h-5 text-white" />
                )}
              </button>
            </div>

            {/* Photo action buttons */}
            <div className="flex gap-2 mt-2">
              <Button
                size="sm"
                variant="ghost"
                className="h-7 px-2 text-xs text-white/50 hover:text-white"
                onClick={() => photoInputRef.current?.click()}
                disabled={uploadingPhoto}
              >
                <Camera className="w-3 h-3 mr-1" />
                {profile.profilePhotoUrl ? 'Change' : 'Upload'} Photo
              </Button>
              {profile.profilePhotoUrl && (
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-7 px-2 text-xs text-red-400/60 hover:text-red-400"
                  onClick={handleRemovePhoto}
                  disabled={uploadingPhoto}
                >
                  <X className="w-3 h-3 mr-1" />
                  Remove
                </Button>
              )}
            </div>

            {/* Hidden file input */}
            <input
              ref={photoInputRef}
              type="file"
              accept="image/jpeg,image/jpg,image/png,image/webp"
              className="hidden"
              onChange={handlePhotoFileChange}
            />
          </div>

          {/* Display Name */}
          <div className="mb-3">
            <p className="text-xs text-white/40 mb-1.5">Display Name</p>
            {editingName ? (
              <div className="flex gap-2">
                <Input
                  value={nameInput}
                  onChange={(e) => setNameInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') handleSaveName()
                    if (e.key === 'Escape') handleCancelName()
                  }}
                  className="h-9 text-sm bg-white/5 border-white/10 flex-1"
                  placeholder="Your display name"
                  autoFocus
                  disabled={savingName}
                />
                <Button
                  size="sm"
                  className="h-9 w-9 p-0 bg-emerald-600 hover:bg-emerald-700"
                  onClick={handleSaveName}
                  disabled={savingName}
                  title="Save"
                >
                  {savingName
                    ? <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                    : <Check className="w-4 h-4" />}
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-9 w-9 p-0 text-white/40 hover:text-white"
                  onClick={handleCancelName}
                  disabled={savingName}
                  title="Cancel"
                >
                  <X className="w-4 h-4" />
                </Button>
              </div>
            ) : (
              <div className="flex items-center justify-between gap-3">
                <p className="font-semibold text-white text-base truncate flex-1">
                  {profileLoading ? (
                    <span className="block h-5 w-32 bg-white/10 rounded animate-pulse" />
                  ) : effectiveDisplayName}
                </p>
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-7 w-7 p-0 text-white/30 hover:text-white flex-shrink-0"
                  onClick={() => {
                    setNameInput(profile.displayName ?? user?.displayName ?? '')
                    setEditingName(true)
                  }}
                  title="Edit display name"
                >
                  <Pencil className="w-3.5 h-3.5" />
                </Button>
              </div>
            )}
          </div>

          <div className="mb-3 grid gap-3 sm:grid-cols-2">
            <div>
              <p className="mb-1.5 text-xs text-white/40">Public Username</p>
              <div className="flex items-center rounded-lg border border-white/10 bg-white/5 pl-3 focus-within:border-blue-500/50"><span className="text-sm text-white/30">@</span><Input value={usernameInput} onChange={(event) => setUsernameInput(event.target.value.toLocaleLowerCase())} className="border-0 bg-transparent" placeholder="your_username" /></div>
            </div>
            <div>
              <p className="mb-1.5 text-xs text-white/40">Email</p>
              <div className="flex h-10 items-center gap-1.5 rounded-lg border border-white/10 bg-white/[0.025] px-3"><Mail className="h-3.5 w-3.5 shrink-0 text-white/30" /><p className="truncate text-sm text-white/55">{user?.email ?? ''}</p></div>
            </div>
          </div>

          <div className="mb-3">
            <p className="mb-1.5 text-xs text-white/40">Short Bio</p>
            <Textarea value={bioInput} onChange={(event) => setBioInput(event.target.value)} maxLength={240} rows={3} placeholder="A short introduction for your profile…" />
          </div>

          <Button className={`mb-4 w-full ${profileDirty ? 'bg-blue-600 text-white hover:bg-blue-500' : ''}`} variant={profileDirty ? 'default' : 'outline'} onClick={handleSaveUnifiedProfile} disabled={savingUnifiedProfile || profileLoading || !profileDirty}>
            <Pencil className="mr-2 h-4 w-4" />{savingUnifiedProfile ? 'Saving Profile…' : 'Save Profile'}
          </Button>

          {/* Member Since */}
          {memberSince && (
            <div className="mb-4">
              <p className="text-xs text-white/40 mb-1">Member Since</p>
              <div className="flex items-center gap-1.5">
                <CalendarDays className="w-3.5 h-3.5 text-white/30 flex-shrink-0" />
                <p className="text-sm text-white/50">{memberSince}</p>
              </div>
            </div>
          )}

          {/* Sign Out */}
          <Button
            variant="outline"
            className="w-full border-white/10 text-white/60 hover:text-white hover:bg-white/5"
            onClick={() => setSignOutDialogOpen(true)}
            disabled={loggingOut}
          >
            <LogOut className="w-4 h-4 mr-2" />
            {loggingOut ? 'Signing out…' : 'Sign Out'}
          </Button>
        </GlassCard>

        <GlassCard padding="md">
          <OverallSummary entries={entries} />
        </GlassCard>

        <GlassCard padding="md">
          <div><h3 className="text-xs font-semibold uppercase tracking-wider text-white/40">Public Profile Settings</h3><p className="mt-1 text-xs text-white/35">Your profile identity is publicly viewable. You control library sharing through Overall Summary and Folder visibility.</p></div>
          <div className="mt-4 rounded-lg border border-white/10 bg-white/[0.025] p-3"><div className="flex items-center justify-between gap-3"><div><p className="text-sm font-medium text-white">Overall Summary Visibility</p><p className="mt-0.5 text-xs text-white/35">Public uses aggregated statistics from your complete library without exposing private titles.</p></div><button disabled={savingSharing} onClick={() => handleSharingChange({ showPublicStats: !profile.showPublicStats })} className={`relative h-6 w-11 shrink-0 rounded-full transition ${profile.showPublicStats ? 'bg-blue-500' : 'bg-white/15'}`} aria-label="Toggle public summary"><span className={`absolute top-1 h-4 w-4 rounded-full bg-white transition ${profile.showPublicStats ? 'left-6' : 'left-1'}`} /></button></div><p className={`mt-2 text-xs font-medium ${profile.showPublicStats ? 'text-blue-300' : 'text-white/40'}`}>{profile.showPublicStats ? 'Public' : 'Private'}</p></div>
          {profile.publicUsername ? <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:items-center"><div className="min-w-0 flex-1 rounded-lg border border-white/10 bg-black/15 px-3 py-2 text-xs text-white/45"><span className="truncate">{typeof window !== 'undefined' ? window.location.origin : ''}/u/{profile.publicUsername}</span></div><Button size="sm" variant="outline" onClick={copyPublicUrl}><Copy className="mr-1.5 h-3.5 w-3.5" />Copy</Button><Button size="sm" asChild><a href={`/u/${profile.publicUsername}`} target="_blank" rel="noreferrer"><ExternalLink className="mr-1.5 h-3.5 w-3.5" />View Public Profile</a></Button></div> : <p className="mt-3 text-xs text-amber-200/75">Save a Public Username above to create your public URL.</p>}
        </GlassCard>

        <GlassCard padding="md">
          <MyLists entries={entries} loading={mediaLoading} profile={profile} onProfileChange={setProfile} />
        </GlassCard>

        {/* ── Section 2: Data Management ── */}
        <GlassCard padding="md">
          <h3 className="text-xs font-semibold text-white/40 uppercase tracking-wider mb-3">
            Data Management
          </h3>

          {/* Import */}
          <div className="mb-4">
            <p className="text-sm text-white/60 font-medium mb-2">Import Library</p>
            <Button variant="outline" className="w-full" asChild>
              <Link href="/import">
                <Upload className="w-4 h-4 mr-2 text-blue-400" />
                Import from Excel / CSV
              </Link>
            </Button>
          </div>

          {/* Export */}
          <div className="mb-4">
            <p className="text-sm text-white/60 font-medium mb-2">Export Library</p>
            <div className="flex gap-3">
              <Button variant="outline" className="flex-1" onClick={handleExcelExport}>
                <FileSpreadsheet className="w-4 h-4 mr-2 text-emerald-400" />
                Excel (.xlsx)
              </Button>
              <Button variant="outline" className="flex-1" onClick={handleCSVExport}>
                <FileText className="w-4 h-4 mr-2 text-blue-400" />
                CSV
              </Button>
            </div>
          </div>

          {/* Danger Zone — Clear All */}
          <div className="border-t border-white/5 pt-4">
            <div className="flex items-center gap-2 mb-2">
              <AlertTriangle className="w-3.5 h-3.5 text-red-400" />
              <p className="text-sm text-red-400/80 font-medium">Danger Zone</p>
            </div>
            <p className="text-xs text-white/30 mb-3">
              Permanently deletes all media entries. This cannot be undone.
            </p>
            <Button
              variant="destructive"
              className="w-full bg-red-600/10 border border-red-500/30 text-red-400 hover:bg-red-600/20"
              onClick={() => { setConfirmInput(''); setClearDialogOpen(true) }}
              disabled={entries.length === 0}
            >
              <Trash2 className="w-4 h-4 mr-2" />
              Clear All Data
              {entries.length > 0 && (
                <span className="ml-2 text-red-400/60">({entries.length})</span>
              )}
            </Button>
          </div>
        </GlassCard>

        {/* ── Section 3: Library Tools ── */}
        <GlassCard padding="md">
          <h3 className="text-xs font-semibold text-white/40 uppercase tracking-wider mb-3">
            Library Tools
          </h3>
          <div className="space-y-2">
          <div className="rounded-xl border border-white/10 bg-white/[0.03] p-3">
            <div className="flex items-start gap-3">
              <div className="w-9 h-9 rounded-lg bg-blue-500/15 border border-blue-500/20 flex items-center justify-center shrink-0">
                <Wrench className="w-4 h-4 text-blue-300" />
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold text-white">Library maintenance and advanced tools</p>
                <p className="text-xs text-white/40 mt-1">
                  {unmatchedCount} unmatched TMDB title{unmatchedCount === 1 ? '' : 's'}
                </p>
                <p className="text-xs text-white/35 mt-0.5">Last Scan: {lastScan}</p>
              </div>
              <Button size="sm" asChild>
                <Link href="/library-tools">Open</Link>
              </Button>
            </div>
          </div>
          <div className="rounded-xl border border-white/10 bg-white/[0.03] p-3">
            <div className="flex items-start gap-3">
              <div className="w-9 h-9 rounded-lg bg-purple-500/15 border border-purple-500/20 flex items-center justify-center shrink-0">
                <History className="w-4 h-4 text-purple-300" />
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold text-white">Activity History</p>
                <p className="text-xs text-white/40 mt-1">
                  {activities.length} recent activit{activities.length === 1 ? 'y' : 'ies'}
                </p>
                <p className="text-xs text-white/35 mt-0.5">Last Activity: {lastActivity}</p>
              </div>
              <Button size="sm" asChild>
                <Link href="/library-tools/activity-history">Open</Link>
              </Button>
            </div>
          </div>
          </div>
        </GlassCard>

        <p className="text-center text-xs text-white/20 pb-2">
          MovieLogger · Your personal cinematic tracker
        </p>
      </motion.div>

      {/* Clear All Data confirmation dialog */}
      <Dialog open={clearDialogOpen} onOpenChange={(o) => { if (!clearing) setClearDialogOpen(o) }}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-red-400">
              <AlertTriangle className="w-5 h-5" />
              Clear All Data
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-4 mt-2">
            <div className="bg-red-500/10 border border-red-500/20 rounded-xl p-3 space-y-1.5 text-sm text-red-300">
              <p className="font-semibold">This will permanently delete:</p>
              <ul className="list-disc list-inside space-y-0.5 text-red-300/80 text-xs">
                <li>All {entries.length} media entries</li>
                <li>All ratings and personal notes</li>
                <li>All watch hours and dates</li>
              </ul>
              <p className="text-xs text-red-300/60 pt-1">Your account will remain active.</p>
            </div>

            <div className="space-y-1.5">
              <p className="text-sm text-white/60">
                Type <span className="font-mono font-bold text-white">{CONFIRM_PHRASE}</span> to confirm
              </p>
              <Input
                value={confirmInput}
                onChange={(e) => setConfirmInput(e.target.value)}
                placeholder={CONFIRM_PHRASE}
                className="font-mono"
                autoComplete="off"
                disabled={clearing}
              />
            </div>

            <div className="flex gap-3">
              <Button
                variant="outline"
                className="flex-1"
                onClick={() => setClearDialogOpen(false)}
                disabled={clearing}
              >
                Cancel
              </Button>
              <Button
                variant="destructive"
                className="flex-1 bg-red-600 hover:bg-red-700"
                onClick={handleClearAllData}
                disabled={confirmInput !== CONFIRM_PHRASE || clearing}
              >
                {clearing ? (
                  <div className="flex items-center gap-2">
                    <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                    Deleting…
                  </div>
                ) : (
                  <>
                    <Trash2 className="w-4 h-4 mr-2" />
                    Delete Everything
                  </>
                )}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
      <Dialog open={signOutDialogOpen} onOpenChange={(open) => { if (!loggingOut) setSignOutDialogOpen(open) }}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle>Sign Out</DialogTitle><DialogDescription>Are you sure you want to sign out?</DialogDescription></DialogHeader>
          <div className="mt-3 flex gap-3"><Button variant="outline" className="flex-1" onClick={() => setSignOutDialogOpen(false)} disabled={loggingOut}>Cancel</Button><Button className="flex-1 bg-red-600 hover:bg-red-500" onClick={handleLogOut} disabled={loggingOut}><LogOut className="mr-2 h-4 w-4" />{loggingOut ? 'Signing out…' : 'Sign Out'}</Button></div>
        </DialogContent>
      </Dialog>
    </AppLayout>
  )
}
