'use client'

import Image from 'next/image'
import { Link2, Film, Tv, CheckCircle2, Lock } from 'lucide-react'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { MediaEntry } from '@/types/media'
import { NormalizedTMDBResult } from '@/types/tmdb'
import { getDisplayTitle, getEffectiveMediaType } from '@/utils/formatters'

interface TMDBLinkDialogProps {
  /** The library entry that will be updated. */
  entry: MediaEntry | null
  /** The TMDB search result the user picked. */
  tmdbResult: NormalizedTMDBResult | null
  open: boolean
  onOpenChange: (open: boolean) => void
  /** Called when the user confirms. Parent handles the async fetch + update. */
  onConfirm: () => void
  loading?: boolean
}

const UPDATED_FIELDS = [
  'TMDB ID',
  'Type',
  'Poster & backdrop',
  'Country',
  'Age rating',
  'Genres',
  'Episode count',
  'Episode runtime',
  'Watch hours',
  'Release year',
]

const PRESERVED_FIELDS = [
  'Status',
  'Personal rating',
  'Date finished',
  'Next episode',
  'Notes',
  'Season number',
  'Title',
]

export function TMDBLinkDialog({
  entry,
  tmdbResult,
  open,
  onOpenChange,
  onConfirm,
  loading = false,
}: TMDBLinkDialogProps) {
  if (!entry || !tmdbResult) return null

  const TypeIcon = tmdbResult.type === 'movie' ? Film : Tv

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!loading) onOpenChange(o) }}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-blue-400">
            <Link2 className="w-5 h-5" />
            Link to TMDB?
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4 mt-1">

          {/* Side-by-side comparison */}
          <div className="grid grid-cols-2 gap-2">

            {/* Current entry */}
            <div className="bg-white/5 border border-white/10 rounded-xl p-3 text-center space-y-2">
              <p className="text-[10px] font-semibold text-white/30 uppercase tracking-wider">Your Entry</p>
              <div className="relative w-10 h-14 rounded-lg overflow-hidden bg-white/5 border border-white/10 mx-auto flex-shrink-0">
                {entry.posterUrl ? (
                  <Image src={entry.posterUrl} alt={entry.title} fill className="object-cover" sizes="40px" />
                ) : (
                  <div className="w-full h-full flex items-center justify-center">
                    <Film className="w-4 h-4 text-white/15" />
                  </div>
                )}
              </div>
              <p className="text-xs font-medium text-white leading-snug line-clamp-2">
                {getDisplayTitle(entry)}
              </p>
              <p className="text-[10px] text-white/40 capitalize">
                {getEffectiveMediaType(entry)} · {entry.yearMade ?? '—'}
              </p>
            </div>

            {/* TMDB result */}
            <div className="bg-blue-500/10 border border-blue-500/20 rounded-xl p-3 text-center space-y-2">
              <p className="text-[10px] font-semibold text-blue-400/60 uppercase tracking-wider">TMDB</p>
              <div className="relative w-10 h-14 rounded-lg overflow-hidden bg-blue-500/10 border border-blue-500/20 mx-auto flex-shrink-0">
                {tmdbResult.posterUrl ? (
                  <Image src={tmdbResult.posterUrl} alt={tmdbResult.title} fill className="object-cover" sizes="40px" />
                ) : (
                  <div className="w-full h-full flex items-center justify-center">
                    <TypeIcon className="w-4 h-4 text-blue-400/30" />
                  </div>
                )}
              </div>
              <p className="text-xs font-medium text-white leading-snug line-clamp-2">
                {tmdbResult.title}
              </p>
              <p className="text-[10px] text-blue-400/60 flex items-center justify-center gap-1">
                <TypeIcon className="w-3 h-3" />
                {tmdbResult.type} · {tmdbResult.year ?? '—'}
              </p>
            </div>
          </div>

          {/* Field change summary */}
          <div className="grid grid-cols-2 gap-3 text-xs">
            <div className="space-y-1.5">
              <p className="font-semibold text-emerald-400 flex items-center gap-1 mb-2">
                <CheckCircle2 className="w-3.5 h-3.5" /> Will update
              </p>
              {UPDATED_FIELDS.map((f) => (
                <p key={f} className="text-white/40 pl-1">{f}</p>
              ))}
            </div>
            <div className="space-y-1.5">
              <p className="font-semibold text-white/40 flex items-center gap-1 mb-2">
                <Lock className="w-3.5 h-3.5" /> Preserved
              </p>
              {PRESERVED_FIELDS.map((f) => (
                <p key={f} className="text-white/40 pl-1">{f}</p>
              ))}
            </div>
          </div>

          {/* Actions */}
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
              className="flex-1 bg-blue-600 hover:bg-blue-700 text-white"
              onClick={onConfirm}
              disabled={loading}
            >
              {loading ? (
                <div className="flex items-center gap-2">
                  <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  Linking…
                </div>
              ) : (
                <>
                  <Link2 className="w-4 h-4 mr-2" />
                  Link to TMDB
                </>
              )}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
