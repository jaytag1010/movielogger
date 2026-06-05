'use client'

import { useState, useEffect } from 'react'
import { useForm, Controller } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { toast } from 'sonner'
import { Loader2, X, Plus } from 'lucide-react'
import { Timestamp } from 'firebase/firestore'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { MediaEntry, MEDIA_STATUS_LABELS } from '@/types/media'
import { useMedia } from '@/hooks/useMedia'
import { CountrySelect } from './CountrySelect'
import { format } from 'date-fns'

const COMMON_GENRES = [
  'Action', 'Adventure', 'Animation', 'Comedy', 'Crime', 'Documentary',
  'Drama', 'Fantasy', 'Horror', 'LGBT', 'Mystery', 'Romance', 'Sci-Fi',
  'Thriller', 'Western', 'Biography', 'History', 'Music', 'Sport', 'War',
]

const schema = z.object({
  title: z.string().min(1, 'Title is required'),
  type: z.enum(['movie', 'series']),
  status: z.enum(['completed', 'watching', 'planned', 'dropped', 'on_hold']),
  seasonNumber: z.coerce.number().int().min(1).nullable().optional(),
  nextEpisodeToWatch: z.coerce.number().int().min(0).nullable().optional(),
  yearMade: z.coerce.number().nullable().optional(),
  totalEpisodes: z.coerce.number().nullable().optional(),
  episodeDurationMinutes: z.coerce.number().nullable().optional(),
  watchHours: z.coerce.number().nullable().optional(),
  personalRating: z.coerce.number().min(0).max(10).nullable().optional(),
  ageRating: z.string().nullable().optional(),
  country: z.string().nullable().optional(),
  dateFinished: z.string().nullable().optional(),
  specialNotes: z.string().nullable().optional(),
})

type FormData = z.infer<typeof schema>

interface EditEntryModalProps {
  entry: MediaEntry | null
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function EditEntryModal({ entry, open, onOpenChange }: EditEntryModalProps) {
  const [genres, setGenres] = useState<string[]>([])
  const [genreInput, setGenreInput] = useState('')
  const { editEntry, entries } = useMedia()

  const { register, handleSubmit, setValue, control, reset, watch, formState: { errors, isSubmitting } } =
    useForm<FormData>({ resolver: zodResolver(schema) })

  const watchType = watch('type')
  const watchTotalEpisodes = watch('totalEpisodes')
  const watchEpDuration = watch('episodeDurationMinutes')

  // For series: auto-calculate watch hours from episodes × duration
  const isSeriesType = watchType === 'series'
  const calculatedSeriesWatchHours: number | null = (() => {
    if (!isSeriesType) return null
    const eps = watchTotalEpisodes ?? null
    const dur = watchEpDuration ?? null
    if (eps != null && eps > 0 && dur != null && dur > 0) {
      return Math.round((eps * dur / 60) * 100) / 100
    }
    return null
  })()

  useEffect(() => {
    if (entry) {
      reset({
        title: entry.title,
        type: entry.type,
        status: entry.status,
        seasonNumber: entry.seasonNumber ?? undefined,
        nextEpisodeToWatch: entry.nextEpisodeToWatch ?? undefined,
        yearMade: entry.yearMade ?? undefined,
        totalEpisodes: entry.totalEpisodes ?? undefined,
        episodeDurationMinutes: entry.episodeDurationMinutes ?? undefined,
        watchHours: entry.watchHours ?? undefined,
        personalRating: entry.personalRating ?? undefined,
        ageRating: entry.ageRating ?? '',
        country: entry.country ?? '',
        dateFinished: entry.dateFinished
          ? format(entry.dateFinished.toDate(), 'yyyy-MM-dd')
          : '',
        specialNotes: entry.specialNotes ?? '',
      })
      setGenres(entry.genres || [])
    }
  }, [entry, reset])

  function addGenre(g: string) {
    const trimmed = g.trim()
    if (trimmed && !genres.includes(trimmed)) setGenres([...genres, trimmed])
    setGenreInput('')
  }

  async function onSubmit(data: FormData) {
    if (!entry?.id) return
    try {
      // "Episodes Watched" is stored in nextEpisodeToWatch (canonical count).
      const watched = data.nextEpisodeToWatch ?? 0
      const recordedTotal = data.totalEpisodes ?? null
      let correctedTotal: number | null
      if (data.type === 'movie') {
        // Movies use Total Episodes = 1.
        correctedTotal = recordedTotal ?? 1
      } else if (
        data.status === 'completed' &&
        watched > 0 &&
        (recordedTotal == null || watched > recordedTotal)
      ) {
        // Completing a series with more watched than recorded — bump the total.
        correctedTotal = watched
      } else {
        correctedTotal = recordedTotal
      }
      const episodesWatched = data.status === 'completed' ? null : watched

      await editEntry(entry.id, {
        title: data.title,
        type: data.type,
        status: data.status,
        seasonNumber: data.type === 'series' ? (data.seasonNumber ?? null) : null,
        nextEpisodeToWatch: episodesWatched,
        yearMade: data.yearMade ?? null,
        totalEpisodes: correctedTotal,
        episodeDurationMinutes: data.episodeDurationMinutes ?? null,
        watchHours: isSeriesType ? (calculatedSeriesWatchHours ?? null) : (data.watchHours ?? null),
        personalRating: data.personalRating ?? null,
        ageRating: data.ageRating || null,
        genres,
        country: data.country || null,
        dateFinished: data.dateFinished
          ? Timestamp.fromDate(new Date(data.dateFinished))
          : null,
        specialNotes: data.specialNotes || null,
      })
      toast.success('Entry updated')
      onOpenChange(false)
    } catch {
      toast.error('Failed to update entry')
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Edit Entry</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4 mt-2">
          <div className="space-y-1.5">
            <Label>Title *</Label>
            <Input {...register('title')} />
            {errors.title && <p className="text-xs text-red-400">{errors.title.message}</p>}
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Type *</Label>
              <Controller name="type" control={control} render={({ field }) => (
                <Select onValueChange={field.onChange} value={field.value}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="movie">Movie</SelectItem>
                    <SelectItem value="series">Series</SelectItem>
                  </SelectContent>
                </Select>
              )} />
            </div>
            <div className="space-y-1.5">
              <Label>Status *</Label>
              <Controller name="status" control={control} render={({ field }) => (
                <Select onValueChange={field.onChange} value={field.value}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {Object.entries(MEDIA_STATUS_LABELS).map(([val, label]) => (
                      <SelectItem key={val} value={val}>{label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )} />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Year</Label>
              <Input type="number" {...register('yearMade')} />
            </div>
            <div className="space-y-1.5">
              <Label>Country</Label>
              <CountrySelect
                value={watch('country')}
                onChange={(v) => setValue('country', v ?? '')}
                libraryEntries={entries}
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Rating (0–10)</Label>
              <Input type="number" step={0.01} min={0} max={10} placeholder="8.25" {...register('personalRating')} />
            </div>
            <div className="space-y-1.5">
              <Label>Age Rating</Label>
              <Input placeholder="PG-13" {...register('ageRating')} />
            </div>
          </div>

          {watchType === 'series' && (
            <div className="space-y-3">
              <div className="space-y-1.5">
                <Label>Season Number</Label>
                <div className="flex items-center gap-2">
                  <Input
                    type="number"
                    min={1}
                    placeholder="1"
                    className="w-24"
                    {...register('seasonNumber')}
                  />
                  <span className="text-xs text-white/30">Leave blank for full series</span>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label>Episodes This Season</Label>
                  <Input type="number" {...register('totalEpisodes')} />
                </div>
                <div className="space-y-1.5">
                  <Label>Ep Duration (min)</Label>
                  <Input type="number" {...register('episodeDurationMinutes')} />
                </div>
              </div>
            </div>
          )}

          {/* Episodes Watched — shown for any non-completed entry (movies & series) */}
          {watch('status') !== 'completed' && (
            <div className="space-y-1.5">
              <Label>Episodes Watched</Label>
              <Input
                type="number"
                min={0}
                placeholder="0"
                className="w-32"
                {...register('nextEpisodeToWatch')}
              />
              <p className="text-xs text-white/30">
                Episodes watched so far. Defaults to 0. Movies count out of 1.
              </p>
            </div>
          )}

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Watch Hours</Label>
              {isSeriesType ? (
                <>
                  <Input
                    type="number"
                    step={0.01}
                    value={calculatedSeriesWatchHours ?? ''}
                    readOnly
                    className="bg-white/[0.02] text-white/50 cursor-not-allowed"
                  />
                  <p className="text-[10px] text-white/30">Auto-calculated from Episodes × Episode Duration.</p>
                </>
              ) : (
                <Input type="number" step={0.5} {...register('watchHours')} />
              )}
            </div>
            <div className="space-y-1.5">
              <Label>Date Finished</Label>
              <Input type="date" {...register('dateFinished')} className="text-white/70" />
            </div>
          </div>

          {/* Genres */}
          <div className="space-y-1.5">
            <Label>Genres</Label>
            <div className="flex flex-wrap gap-1.5 mb-2">
              {genres.map((g) => (
                <span key={g} className="inline-flex items-center gap-1 text-xs bg-blue-600/20 text-blue-400 border border-blue-500/20 rounded-full px-2.5 py-1">
                  {g}
                  <button type="button" onClick={() => setGenres(genres.filter((x) => x !== g))}>
                    <X className="w-3 h-3" />
                  </button>
                </span>
              ))}
            </div>
            <div className="flex gap-2">
              <Input
                value={genreInput}
                onChange={(e) => setGenreInput(e.target.value)}
                placeholder="Add genre..."
                onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addGenre(genreInput) } }}
              />
              <Button type="button" variant="outline" size="icon" onClick={() => addGenre(genreInput)}>
                <Plus className="w-4 h-4" />
              </Button>
            </div>
            <div className="flex flex-wrap gap-1.5 mt-1.5">
              {COMMON_GENRES.filter((g) => !genres.includes(g)).map((g) => (
                <button
                  key={g}
                  type="button"
                  onClick={() => addGenre(g)}
                  className="text-xs text-white/40 hover:text-white/70 bg-white/5 hover:bg-white/10 border border-white/10 rounded-full px-2 py-0.5 transition-all"
                >
                  {g}
                </button>
              ))}
            </div>
          </div>

          <div className="space-y-1.5">
            <Label>Notes</Label>
            <Textarea {...register('specialNotes')} rows={2} />
          </div>

          <div className="flex gap-3 pt-1">
            <Button type="button" variant="outline" className="flex-1" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" className="flex-1" disabled={isSubmitting}>
              {isSubmitting ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Save Changes'}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  )
}
