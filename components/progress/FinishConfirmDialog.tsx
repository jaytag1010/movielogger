'use client'

import { CheckCircle } from 'lucide-react'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { MediaEntry } from '@/types/media'
import { getDisplayTitle } from '@/utils/formatters'

interface FinishConfirmDialogProps {
  entry: MediaEntry | null
  open: boolean
  onOpenChange: (open: boolean) => void
  onConfirm: () => void
  loading?: boolean
}

export function FinishConfirmDialog({
  entry,
  open,
  onOpenChange,
  onConfirm,
  loading = false,
}: FinishConfirmDialogProps) {
  if (!entry) return null

  const displayTitle = getDisplayTitle(entry)

  // Build a friendly description of the current progress
  const progressLine = (() => {
    if (entry.type === 'movie') return null
    if (entry.nextEpisodeToWatch != null && entry.totalEpisodes != null) {
      return `Currently at episode ${entry.nextEpisodeToWatch} of ${entry.totalEpisodes}`
    }
    if (entry.nextEpisodeToWatch != null) {
      return `Currently at episode ${entry.nextEpisodeToWatch}`
    }
    return null
  })()

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!loading) onOpenChange(o) }}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-emerald-400">
            <CheckCircle className="w-5 h-5" />
            Mark as Finished?
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4 mt-1">
          <p className="text-sm text-white/70 font-medium leading-snug">{displayTitle}</p>
          {progressLine && (
            <p className="text-xs text-white/40">{progressLine}</p>
          )}

          <div className="bg-white/5 border border-white/10 rounded-xl p-3 space-y-1.5 text-xs text-white/50">
            <p className="font-semibold text-white/70 text-sm mb-2">This will:</p>
            <ul className="space-y-1.5">
              <li className="flex items-start gap-2">
                <span className="text-emerald-400 mt-0.5">✓</span>
                Set status to <span className="text-emerald-400 font-medium">Completed</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-emerald-400 mt-0.5">✓</span>
                Set date finished to <span className="text-white/70 font-medium">today</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-white/30 mt-0.5">→</span>
                Remove from Progress tracker
              </li>
            </ul>
          </div>

          <div className="flex gap-3 pt-1">
            <Button
              variant="outline"
              className="flex-1"
              onClick={() => onOpenChange(false)}
              disabled={loading}
            >
              Cancel
            </Button>
            <Button
              className="flex-1 bg-emerald-600 hover:bg-emerald-700 text-white"
              onClick={onConfirm}
              disabled={loading}
            >
              {loading ? (
                <div className="flex items-center gap-2">
                  <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  Saving…
                </div>
              ) : (
                <>
                  <CheckCircle className="w-4 h-4 mr-2" />
                  Mark Finished
                </>
              )}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
