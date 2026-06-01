'use client'

export const dynamic = 'force-dynamic'

import { useState } from 'react'
import Link from 'next/link'
import { motion } from 'framer-motion'
import { toast } from 'sonner'
import {
  LogOut,
  Download,
  FileSpreadsheet,
  FileText,
  Film,
  Tv,
  Clock,
  Star,
  CheckCircle,
  Mail,
  Trash2,
  AlertTriangle,
  Upload,
  Database,
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
import { deleteAllUserEntries } from '@/lib/firebase/firestore'
import { calculateTotalWatchHours } from '@/utils/watchTime'
import { formatWatchTime } from '@/utils/formatters'

const CONFIRM_PHRASE = 'CONTINUE'

export default function ProfilePage() {
  const { user } = useAuthStore()
  const { logOut } = useAuthActions()
  const { entries } = useMedia()
  const { setEntries } = useMediaStore()
  const router = useRouter()

  const [loggingOut, setLoggingOut] = useState(false)
  const [clearDialogOpen, setClearDialogOpen] = useState(false)
  const [confirmInput, setConfirmInput] = useState('')
  const [clearing, setClearing] = useState(false)

  const completed = entries.filter((e) => e.status === 'completed')
  const movies = entries.filter((e) => e.type === 'movie')
  const series = entries.filter((e) => e.type === 'series')
  const totalHours = calculateTotalWatchHours(completed)
  const ratedEntries = entries.filter((e) => e.personalRating !== null)
  const avgRating =
    ratedEntries.length > 0
      ? ratedEntries.reduce((s, e) => s + (e.personalRating ?? 0), 0) / ratedEntries.length
      : 0

  const initials = user?.displayName
    ? user.displayName.split(' ').map((n) => n[0]).join('').toUpperCase().slice(0, 2)
    : user?.email?.[0]?.toUpperCase() || 'U'

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
    toast.success('Exported to Excel')
  }

  function handleCSVExport() {
    if (entries.length === 0) { toast.error('Nothing to export'); return }
    exportToCSV(entries)
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

  const stats = [
    { label: 'Movies', value: movies.length, icon: Film, color: 'text-purple-400' },
    { label: 'Series', value: series.length, icon: Tv, color: 'text-cyan-400' },
    { label: 'Total', value: entries.length, icon: Database, color: 'text-blue-400' },
    { label: 'Completed', value: completed.length, icon: CheckCircle, color: 'text-emerald-400' },
    { label: 'Watch Time', value: formatWatchTime(totalHours), icon: Clock, color: 'text-amber-400' },
    {
      label: 'Avg Rating',
      value: ratedEntries.length > 0 ? avgRating.toFixed(2) : '—',
      icon: Star,
      color: 'text-yellow-400',
    },
  ]

  return (
    <AppLayout title="Profile" subtitle="Account &amp; settings">
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        className="space-y-4"
      >

        {/* ── Section 1: Account ── */}
        <GlassCard padding="md">
          <h3 className="text-xs font-semibold text-white/40 uppercase tracking-wider mb-3">
            Account
          </h3>
          <div className="flex items-center gap-4 mb-4">
            <Avatar className="w-16 h-16 border-2 border-white/10">
              <AvatarImage src={user?.photoURL || ''} />
              <AvatarFallback className="text-lg">{initials}</AvatarFallback>
            </Avatar>
            <div className="flex-1 min-w-0">
              <p className="font-semibold text-white text-lg truncate">
                {user?.displayName || 'Anonymous User'}
              </p>
              <div className="flex items-center gap-1.5 mt-0.5">
                <Mail className="w-3.5 h-3.5 text-white/30" />
                <p className="text-sm text-white/50 truncate">{user?.email}</p>
              </div>
            </div>
          </div>
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

        {/* ── Section 3: Statistics ── */}
        <GlassCard padding="md">
          <h3 className="text-xs font-semibold text-white/40 uppercase tracking-wider mb-3">
            Statistics
          </h3>
          <div className="grid grid-cols-3 gap-3">
            {stats.map((stat) => (
              <div key={stat.label} className="text-center">
                <stat.icon className={`w-5 h-5 ${stat.color} mx-auto mb-1`} />
                <p className="text-lg font-bold text-white">{stat.value}</p>
                <p className="text-xs text-white/40">{stat.label}</p>
              </div>
            ))}
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
