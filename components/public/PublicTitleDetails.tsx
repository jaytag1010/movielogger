'use client'

import { CalendarDays, Clock3, Film, Star, Tv, Clapperboard } from 'lucide-react'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Badge } from '@/components/ui/badge'
import { TMDBPosterImage } from '@/components/common/TMDBPosterImage'
import type { PublicTitleDocument } from '@/types/public'
import { MEDIA_STATUS_LABELS } from '@/types/media'
import { formatWatchHours, getMediaTypeLabel } from '@/utils/formatters'

export function PublicTitleDetails({ title, open, onOpenChange }: { title: PublicTitleDocument | null; open: boolean; onOpenChange: (open: boolean) => void }) {
  if (!title) return null
  const Icon = title.type === 'movie' ? Film : title.type === 'shorts' ? Clapperboard : Tv
  return <Dialog open={open} onOpenChange={onOpenChange}>
    <DialogContent className="max-w-3xl overflow-hidden p-0">
      <div className="max-h-[88vh] overflow-y-auto bg-[#0b0d16] p-4 sm:p-5">
        <div className="flex gap-4 pr-8">
          <div className="relative h-36 w-24 shrink-0 overflow-hidden rounded-lg border border-white/10 bg-white/5 sm:h-44 sm:w-28">
            {title.posterUrl ? <TMDBPosterImage src={title.posterUrl} alt={title.title} fill sizes="112px" className="object-cover" /> : <div className="flex h-full items-center justify-center"><Icon className="h-7 w-7 text-white/20" /></div>}
          </div>
          <div className="min-w-0 flex-1">
            <DialogHeader className="text-left"><DialogTitle className="text-xl sm:text-2xl">{title.title}</DialogTitle><DialogDescription>{title.nativeTitle || `${getMediaTypeLabel(title.type)} details`}</DialogDescription></DialogHeader>
            <div className="mt-3 flex flex-wrap gap-2"><Badge>{MEDIA_STATUS_LABELS[title.status]}</Badge><Badge variant="outline">{getMediaTypeLabel(title.type)}</Badge>{title.seasonNumber != null && title.type !== 'movie' && <Badge variant="outline">Season {title.seasonNumber}</Badge>}</div>
            <div className="mt-3 flex flex-wrap gap-3 text-sm text-white/50">{title.yearMade && <span>{title.yearMade}</span>}{title.country && <span>{title.country}</span>}{title.personalRating != null && <span className="inline-flex items-center gap-1 font-semibold text-amber-300"><Star className="h-4 w-4 fill-current" />{title.personalRating.toFixed(2)}</span>}</div>
          </div>
        </div>

        <div className="mt-5 grid gap-4 md:grid-cols-2">
          <Section title="Overview"><p>{title.overview?.trim() || 'No overview available.'}</p></Section>
          <Section title="Watching / Completion"><Details rows={[
            ['Status', MEDIA_STATUS_LABELS[title.status]],
            ['Episodes Watched', String(title.episodesWatched)],
            title.totalEpisodes != null ? ['Total Episodes', String(title.totalEpisodes)] : null,
            title.episodeDurationMinutes != null ? ['Episode Duration', `${title.episodeDurationMinutes} min`] : null,
            ['Total Watch Hours', formatWatchHours(title.watchHours)],
            title.rewatchCount > 0 ? ['Rewatch Counter', String(title.rewatchCount)] : null,
            title.priority != null && (title.status === 'planned' || title.status === 'on_hold') ? ['Priority', `${title.priority}/5`] : null,
          ]} /></Section>
          <Section title="Metadata"><Details rows={[
            title.genres.length ? ['Genres', title.genres.join(', ')] : null,
            title.country ? ['Country', title.country] : null,
            title.yearMade != null ? ['Year', String(title.yearMade)] : null,
            title.ageRating ? ['Age Rating', title.ageRating] : null,
            title.tmdbRating != null ? ['TMDB Rating', `${title.tmdbRating.toFixed(1)}/10`] : null,
          ]} /></Section>
          <Section title="Notes / Review"><p className="whitespace-pre-wrap">{title.specialNotes?.trim() || 'No notes.'}</p></Section>
        </div>
      </div>
    </DialogContent>
  </Dialog>
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return <section className="rounded-xl border border-white/10 bg-white/[0.025] p-3"><h3 className="mb-2 text-xs font-semibold uppercase text-blue-300/80">{title}</h3><div className="text-sm leading-relaxed text-white/65">{children}</div></section>
}

function Details({ rows }: { rows: (string[] | null)[] }) {
  return <dl className="space-y-1.5">{rows.filter(Boolean).map((row) => <div key={row![0]} className="flex justify-between gap-3 border-b border-white/5 pb-1"><dt className="text-white/40">{row![0]}</dt><dd className="text-right text-white/75">{row![1]}</dd></div>)}</dl>
}
