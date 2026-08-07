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
  Loader2,
} from 'lucide-react'
import { AppLayout } from '@/components/layout/AppLayout'
import { GlassCard } from '@/components/common/GlassCard'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { useAuthStore } from '@/store/authStore'
import { useAuthActions } from '@/hooks/useAuth'
import { useMedia } from '@/hooks/useMedia'
import { useMediaStore } from '@/store/mediaStore'
import { useRouter } from 'next/navigation'
import { exportToExcel, exportToCSV } from '@/lib/export/exporter'
import { deleteAllUserEntries, getUserProfile, updateMediaEntry, updateUserProfile, UserProfile } from '@/lib/firebase/firestore'
import { addActivity } from '@/lib/firebase/activity'
import { validatePosterFile, uploadPoster } from '@/lib/imgbb'
import { useActivityHistory } from '@/hooks/useActivityHistory'
import { fetchMovieMetadata, fetchTVMetadata } from '@/lib/tmdb/api'
import { getEffectiveMediaType } from '@/utils/formatters'

const CONFIRM_PHRASE = 'CONTINUE'

/** Mask email: preserve first char, last char before @, mask everything between, preserve domain. */
function maskEmail(email: string): string {
  const atIdx = email.indexOf('@')
  if (atIdx < 0) return email
  const local = email.slice(0, atIdx)
  const domain = email.slice(atIdx) // includes '@'
  if (local.length <= 2) return email
  return local[0] + '*'.repeat(local.length - 2) + local[local.length - 1] + domain
}

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
  const { entries } = useMedia()
  const { activities } = useActivityHistory()
  const { setEntries } = useMediaStore()
  const router = useRouter()

  // ── Profile customization state ──────────────────────────────────────────
  const [profile, setProfile] = useState<UserProfile>({ displayName: null, profilePhotoUrl: null })
  const [profileLoading, setProfileLoading] = useState(true)

  // Display name editing
  const [editingName, setEditingName] = useState(false)
  const [nameInput, setNameInput] = useState('')
  const [savingName, setSavingName] = useState(false)

  // Photo upload
  const [uploadingPhoto, setUploadingPhoto] = useState(false)
  const photoInputRef = useRef<HTMLInputElement>(null)

  // ── Existing state ────────────────────────────────────────────────────────
  const [loggingOut, setLoggingOut] = useState(false)
  const [clearDialogOpen, setClearDialogOpen] = useState(false)
  const [confirmInput, setConfirmInput] = useState('')
  const [clearing, setClearing] = useState(false)
  const [overviewMigration, setOverviewMigration] = useState({
    running: false,
    current: 0,
    total: 0,
    updated: 0,
    skipped: 0,
    failed: 0,
  })

  // ── Load profile on mount ─────────────────────────────────────────────────
  useEffect(() => {
    if (!user) return
    getUserProfile(user.uid)
      .then((p) => {
        setProfile(p)
        setNameInput(p.displayName ?? user.displayName ?? '')
      })
      .catch(() => {
        setNameInput(user.displayName ?? '')
      })
      .finally(() => setProfileLoading(false))
  }, [user])

  // ── Derived values ────────────────────────────────────────────────────────
  const effectiveDisplayName = profile.displayName || user?.displayName || 'Anonymous User'
  const effectivePhotoUrl    = profile.profilePhotoUrl || user?.photoURL || ''
  const maskedEmail          = user?.email ? maskEmail(user.email) : ''
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
  const overviewMigrationCandidates = entries.filter(
    (entry) => entry.id && entry.tmdbId != null && !entry.overview?.trim()
  )
  const overviewMigrationPercent = overviewMigration.total > 0
    ? Math.round((overviewMigration.current / overviewMigration.total) * 100)
    : 0

  const initials = effectiveDisplayName
    .split(' ')
    .map((n) => n[0])
    .join('')
    .toUpperCase()
    .slice(0, 2) || 'U'

  // ── Handlers ──────────────────────────────────────────────────────────────

  async function handleLogOut() {
    setLoggingOut(true)
    try {
      await logOut()
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

  async function handleOverviewMigration() {
    const candidates = entries.filter((entry) => entry.id && entry.tmdbId != null && !entry.overview?.trim())
    if (candidates.length === 0) {
      toast.success('All TMDB-linked titles already have overviews')
      setOverviewMigration({
        running: false,
        current: 0,
        total: 0,
        updated: 0,
        skipped: 0,
        failed: 0,
      })
      return
    }

    setOverviewMigration({
      running: true,
      current: 0,
      total: candidates.length,
      updated: 0,
      skipped: 0,
      failed: 0,
    })

    let updated = 0
    let skipped = 0
    let failed = 0

    for (let i = 0; i < candidates.length; i++) {
      const entry = candidates[i]
      setOverviewMigration({
        running: true,
        current: i + 1,
        total: candidates.length,
        updated,
        skipped,
        failed,
      })

      try {
        if (!entry.id || entry.tmdbId == null) {
          skipped++
          continue
        }

        const type = getEffectiveMediaType(entry)
        const metadata = type === 'movie'
          ? await fetchMovieMetadata(entry.tmdbId)
          : await fetchTVMetadata(entry.tmdbId)
        const overview = metadata.overview?.trim() || null

        if (!overview) {
          skipped++
          continue
        }

        await updateMediaEntry(entry.id, { overview }, { preserveOrder: true })
        const currentEntries = useMediaStore.getState().entries
        setEntries(currentEntries.map((item) => item.id === entry.id ? { ...item, overview } : item))
        updated++
      } catch {
        failed++
      }

      setOverviewMigration({
        running: true,
        current: i + 1,
        total: candidates.length,
        updated,
        skipped,
        failed,
      })
    }

    setOverviewMigration({
      running: false,
      current: candidates.length,
      total: candidates.length,
      updated,
      skipped,
      failed,
    })

    toast.success(`Overview migration complete: ${updated} updated, ${skipped} skipped, ${failed} failed`)
  }

  /** Upload a new profile photo via ImgBB and persist the URL. */
  async function handlePhotoFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file || !user) return
    // Reset input so same file can be re-selected
    e.target.value = ''

    setUploadingPhoto(true)
    try {
      validatePosterFile(file)
      const url = await uploadPoster(file)
      await updateUserProfile(user.uid, { profilePhotoUrl: url })
      setProfile((prev) => ({ ...prev, profilePhotoUrl: url }))
      toast.success('Profile photo updated')
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Photo upload failed')
    } finally {
      setUploadingPhoto(false)
    }
  }

  /** Remove current profile photo (sets to null in Firestore). */
  async function handleRemovePhoto() {
    if (!user) return
    try {
      await updateUserProfile(user.uid, { profilePhotoUrl: null })
      setProfile((prev) => ({ ...prev, profilePhotoUrl: null }))
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

          {/* Email (masked) */}
          <div className="mb-3">
            <p className="text-xs text-white/40 mb-1">Email</p>
            <div className="flex items-center gap-1.5">
              <Mail className="w-3.5 h-3.5 text-white/30 flex-shrink-0" />
              <p className="text-sm text-white/50 font-mono">{maskedEmail}</p>
            </div>
          </div>

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
            onClick={handleLogOut}
            disabled={loggingOut}
          >
            <LogOut className="w-4 h-4 mr-2" />
            {loggingOut ? 'Signing out…' : 'Sign Out'}
          </Button>
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
          <div className="rounded-xl border border-amber-500/20 bg-amber-500/[0.06] p-3">
            <div className="flex items-start gap-3">
              <div className="w-9 h-9 rounded-lg bg-amber-500/15 border border-amber-500/20 flex items-center justify-center shrink-0">
                {overviewMigration.running ? (
                  <Loader2 className="w-4 h-4 text-amber-300 animate-spin" />
                ) : (
                  <Wrench className="w-4 h-4 text-amber-300" />
                )}
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-white">Temporary Overview Migration</p>
                    <p className="text-xs text-white/40 mt-1">
                      {overviewMigration.running
                        ? `Migrating ${overviewMigration.current} / ${overviewMigration.total} (${overviewMigrationPercent}%)`
                        : `${overviewMigrationCandidates.length} TMDB-linked title${overviewMigrationCandidates.length === 1 ? '' : 's'} missing overview`}
                    </p>
                  </div>
                  <Button
                    size="sm"
                    onClick={handleOverviewMigration}
                    disabled={overviewMigration.running || overviewMigrationCandidates.length === 0}
                  >
                    {overviewMigration.running ? 'Running...' : 'Run'}
                  </Button>
                </div>

                {(overviewMigration.running || overviewMigration.total > 0) && (
                  <div className="mt-3 space-y-2">
                    <div className="h-2 overflow-hidden rounded-full bg-white/10">
                      <div
                        className="h-full rounded-full bg-amber-400 transition-all"
                        style={{ width: `${overviewMigrationPercent}%` }}
                      />
                    </div>
                    <p className="text-[11px] text-white/40">
                      Updated: {overviewMigration.updated} · Skipped: {overviewMigration.skipped} · Failed: {overviewMigration.failed}
                    </p>
                  </div>
                )}
              </div>
            </div>
          </div>
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
    </AppLayout>
  )
}
