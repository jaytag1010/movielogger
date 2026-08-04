'use client'

export const dynamic = 'force-dynamic'

import Link from 'next/link'
import { ArrowLeft } from 'lucide-react'
import { AppLayout } from '@/components/layout/AppLayout'
import { GlassCard } from '@/components/common/GlassCard'
import { Button } from '@/components/ui/button'
import { ActivityHistory } from '@/components/profile/ActivityHistory'

export default function ActivityHistoryPage() {
  return (
    <AppLayout title="Activity History" subtitle="Audit meaningful MovieLogger actions">
      <div className="space-y-4">
        <Button variant="ghost" size="sm" asChild className="text-white/60 hover:text-white">
          <Link href="/library-tools">
            <ArrowLeft className="w-4 h-4 mr-2" />
            Back to Library Tools
          </Link>
        </Button>

        <GlassCard padding="md">
          <ActivityHistory />
        </GlassCard>
      </div>
    </AppLayout>
  )
}
