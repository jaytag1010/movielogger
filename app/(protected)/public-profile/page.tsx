'use client'

import Link from 'next/link'
import { ArrowLeft } from 'lucide-react'
import { AppLayout } from '@/components/layout/AppLayout'
import { Button } from '@/components/ui/button'
import { PublicProfileSettings } from '@/components/profile/PublicProfileSettings'

export default function PublicProfileSettingsPage() {
  return (
    <AppLayout title="Privacy & Sharing" subtitle="Public Profile">
      <Button variant="ghost" size="sm" className="mb-4" asChild><Link href="/profile"><ArrowLeft className="mr-2 h-4 w-4" />Back to Profile</Link></Button>
      <PublicProfileSettings />
    </AppLayout>
  )
}
