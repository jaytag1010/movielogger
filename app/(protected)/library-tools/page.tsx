'use client'

export const dynamic = 'force-dynamic'

import Link from 'next/link'
import { ArrowLeft, Hammer, History, SearchCheck, ShieldCheck } from 'lucide-react'
import { AppLayout } from '@/components/layout/AppLayout'
import { GlassCard } from '@/components/common/GlassCard'
import { Button } from '@/components/ui/button'
import { LibraryMaintenance } from '@/components/profile/LibraryMaintenance'
import { useMedia } from '@/hooks/useMedia'

export default function LibraryToolsPage() {
  const { entries, editEntry } = useMedia()

  return (
    <AppLayout title="Library Tools" subtitle="Repair and maintain your library metadata">
      <div className="space-y-4">
        <Button variant="ghost" size="sm" asChild className="text-white/60 hover:text-white">
          <Link href="/profile">
            <ArrowLeft className="w-4 h-4 mr-2" />
            Back to Profile
          </Link>
        </Button>

        <GlassCard padding="md">
          <LibraryMaintenance entries={entries} editEntry={editEntry} />
        </GlassCard>

        <GlassCard padding="md">
          <h3 className="text-xs font-semibold text-white/40 uppercase tracking-wider mb-3">
            Library Tools
          </h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            <Link
              href="/library-tools/activity-history"
              className="rounded-xl border border-blue-500/20 bg-blue-500/10 px-3 py-2 flex items-center gap-2 hover:bg-blue-500/15 transition-colors"
            >
              <History className="w-4 h-4 text-blue-300" />
              <div>
                <p className="text-sm font-medium text-white">Activity History</p>
                <p className="text-[11px] text-white/40">Review important library actions</p>
              </div>
            </Link>
            <FutureTool icon={SearchCheck} label="Duplicate Checker" />
            <FutureTool icon={ShieldCheck} label="Library Integrity" />
            <FutureTool icon={Hammer} label="Metadata Utilities" />
          </div>
        </GlassCard>
      </div>
    </AppLayout>
  )
}

function FutureTool({ icon: Icon, label }: { icon: typeof Hammer; label: string }) {
  return (
    <div className="rounded-xl border border-white/10 bg-white/[0.03] px-3 py-2 flex items-center gap-2">
      <Icon className="w-4 h-4 text-white/35" />
      <span className="text-sm text-white/45">{label}</span>
    </div>
  )
}
