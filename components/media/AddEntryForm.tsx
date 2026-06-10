'use client'

import { useState, useEffect } from 'react'
import Image from 'next/image'
import { motion } from 'framer-motion'
import { useForm, Controller } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { toast } from 'sonner'
import { Loader2, X, Plus, Film, Tv, Star } from 'lucide-react'
import { Timestamp } from 'firebase/firestore'
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
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { TMDBSearch } from './TMDBSearch'
import { CountrySelect } from './CountrySelect'
import { NormalizedTMDBResult } from '@/types/tmdb'
import { useTMDBDetails, useTMDBSeasonDetails } from '@/hooks/useTMDB'
import { MediaStatus, MEDIA_STATUS_LABELS } from '@/types/media'
import { useMedia } from '@/hooks/useMedia'

const COMMON_GENRES = [
  'Action', 'Adventure', 'Animation', 'Comedy', 'Crime', 'Documentary',
  'Drama', 'Fantasy', 'Horror', 'LGBT', 'Mystery', 'Romance', 'Sci-Fi',
  'Thriller', 'Western', 'Biography', 'History', 'Music', 'Sport', 'War',
]

const schema = z.object({
  title: z.string().min(1, 'Title is required'),
  type: z.enum(['movie', 'series']),
  status: z.enum(['completed', 'watching', 'planned', 'dropped', 'on_hold']),
  // Blank or empty → null (treated as Season 1 on save). Non-blank must be ≥ 1.
  seasonNumber: z.preprocess(
    (v) => (v === '' || v == null ? null : v),
    z.coerce.number().int().min(1).nullable().optional()
  ),
  nextEpisodeToWatch: z.coerce.number().int().min(0).nullable().optional(),
  yearMade: z.coerce.number().min(1888).max(2100).nullable().optional(),
  totalEpisodes: z.coerce.number().min(1).nullable().optional(),
  episodeDurationMinutes: z.coerce.number().min(0.01).nullable().optional(),
  watchHours: z.coerce.number().min(0).nullable().optional(),
  personalRating: z.coerce.number().min(0).max(10).nullable().optional(),
  ageRating: z.string().nullable().optional(),
  country: z.string().nullable().optional(),
  dateFinished: z.string().nullable().optional(),
  specialNotes: z.string().nullable().optional(),
})

type FormData = z.infer<typeof schema>

interface AddEntryFormProps {
  onSuccess?: () => void
  /** Called when the user chooses to cancel adding an entry. */
  onCancel?: () => void
  /**
   * When set (e.g. arriving from GlobalSearch "Add to Library"),
   * the form auto-fetches and prefills TMDB metadata on mount.
   */
  tmdbPreload?: { tmdbId: number; tmdbType: 'movie' | 'series' }
}

export function AddEntryForm({ onSuccess, onCancel, tmdbPreload }: AddEntryFormProps) {
  const [tmdbData, setTmdbData] = useState<NormalizedTMDBResult | null>(null)
  const [genres, setGenres] = useState<string[]>([])
  const [genreInput, setGenreInput] = useState('')
  const [showDiscard, setShowDiscard] = useState(false)
  const { fetchDetails, loading: tmdbLoading } = useTMDBDetails()
  const { fetchSeason, loading: seasonLoading } = useTMDBSeasonDetails()
  const { addEntry, entries } = useMedia()

  const {
    register,
    handleSubmit,
    setValue,
    watch,
    control,
    reset,
    formState: { errors, isSubmitting, isDirty },
  } = useForm<FormData>({
    resolver: zodResolver(schema),
    // No type pre-selection — user picks after TMDB selection auto-fills it,
    // or selects manually. Status defaults to completed as a sensible default.
    defaultValues: { status: 'completed' },
  })

  const watchType = watch('type')
  const watchRating = watch('personalRating')
  const watchSeasonNumber = watch('seasonNumber')
  const watchStatus = watch('status')

  // Auto-prefill TMDB data when arriving via "Add to Library" from GlobalSearch.
  useEffect(() => {
    if (!tmdbPreload) return
    let cancelled = false
    fetchDetails(tmdbPreload.tmdbId, tmdbPreload.tmdbType).then((data) => {
      if (cancelled || !data) return
      setTmdbData(data)
      setValue('title', data.title)
      setValue('type', data.type === 'movie' ? 'movie' : 'series')
      if (data.year)           setValue('yearMade',               data.year)
      if (data.country)        setValue('country',                data.country)
      if (data.runtime)        setValue('episodeDurationMinutes', data.runtime)
      if (data.totalEpisodes)  setValue('totalEpisodes',          data.totalEpisodes)
      if (data.ageRating)      setValue('ageRating',              data.ageRating)
      if (data.genres.length > 0) setGenres(data.genres)
      toast.success('TMDB metadata loaded')
    })
    return () => { cancelled = true }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []) // intentionally runs only on initial mount

  async function handleTMDBSelect(result: NormalizedTMDBResult) {
    const details = await fetchDetails(result.tmdbId, result.type as 'movie' | 'series')
    const data = details || result
    setTmdbData(data)

    setValue('title', data.title)
    setValue('type', data.type === 'movie' ? 'movie' : 'series')
    if (data.year) setValue('yearMade', data.year)
    if (data.country) setValue('country', data.country)
    if (data.runtime) setValue('episodeDurationMinutes', data.runtime)
    if (data.totalEpisodes) setValue('totalEpisodes', data.totalEpisodes)
    if (data.ageRating) setValue('ageRating', data.ageRating)
    if (data.genres.length > 0) setGenres(data.genres)

    // If a season number is already filled in, auto-fetch season metadata now
    if (data.type === 'series' && watchSeasonNumber) {
      await applySeasonMetadata(data.tmdbId, watchSeasonNumber)
    }
    toast.success('Metadata loaded from TMDB')
  }

  /** Fetch season-specific metadata and override episode/runtime/year/poster fields. */
  async function applySeasonMetadata(seriesId: number, seasonNum: number) {
    const season = await fetchSeason(seriesId, seasonNum)
    if (!season) return
    if (season.episodeCount) setValue('totalEpisodes', season.episodeCount)
    if (season.avgRuntime) setValue('episodeDurationMinutes', season.avgRuntime)
    if (season.year) setValue('yearMade', season.year)
    if (season.episodeCount && season.avgRuntime) {
      setValue('watchHours', Math.round(season.episodeCount * season.avgRuntime / 60 * 100) / 100)
    }
  }

  /** Called when the user manually changes the Season # field. */
  async function handleSeasonChange(seasonNum: number | null) {
    if (!tmdbData || tmdbData.type !== 'series' || !seasonNum) return
    await applySeasonMetadata(tmdbData.tmdbId, seasonNum)
    toast.success(`Season ${seasonNum} metadata loaded`)
  }

  function handleCancelClick() {
    if (isDirty || tmdbData || genres.length > 0) {
      setShowDiscard(true)
    } else {
      onCancel?.()
    }
  }

  function addGenre(genre: string) {
    const g = genre.trim()
    if (g && !genres.includes(g)) setGenres([...genres, g])
    setGenreInput('')
  }

  function removeGenre(genre: string) {
    setGenres(genres.filter((g) => g !== genre))
  }

  async function onSubmit(data: FormData) {
    try {
      // Episodes Watched: hidden (null) for completed; otherwise the entered count (default 0).
      // Applies to both movies and series.
      const episodesWatched = data.status === 'completed' ? null : (data.nextEpisodeToWatch ?? 0)
      // Movies use Total Episodes = 1 so progress shows out of 1.
      const resolvedTotalEpisodes =
        data.type === 'movie' ? (data.totalEpisodes ?? 1) : (data.totalEpisodes ?? null)

      await addEntry({
        title: data.title,
        nativeTitle: null,
        tmdbReleaseDate: tmdbData?.releaseDate ?? null,
        type: data.type,
        status: data.status,
        // Default season to 1 for series when left blank (Improvement 05).
        seasonNumber: data.type === 'series' ? (data.seasonNumber ?? 1) : null,
        nextEpisodeToWatch: episodesWatched,
        tmdbId: tmdbData?.tmdbId ?? null,
        yearMade: data.yearMade ?? null,
        totalEpisodes: resolvedTotalEpisodes,
        episodeDurationMinutes: data.episodeDurationMinutes ?? null,
        watchHours: data.watchHours ?? null,
        personalRating: data.personalRating ?? null,
        ageRating: data.ageRating ?? null,
        genres,
        country: data.country ?? null,
        dateFinished: data.dateFinished
          ? Timestamp.fromDate(new Date(data.dateFinished))
          : null,
        specialNotes: data.specialNotes ?? null,
        posterUrl: tmdbData?.posterUrl ?? null,
        backdropUrl: tmdbData?.backdropUrl ?? null,
        manualPosterUrl: null,
        legacyId: null,
      })
      toast.success(`"${data.title}" added to your list!`)
      reset({ status: 'completed' })
      setTmdbData(null)
      setGenres([])
      onSuccess?.()
    } catch (err) {
      toast.error('Failed to add entry')
    }
  }

  return (
    <>
    {/* Discard Changes confirmation dialog */}
    <Dialog open={showDiscard} onOpenChange={setShowDiscard}>
      <DialogContent className="max-w-xs">
        <DialogHeader>
          <DialogTitle>Discard Changes?</DialogTitle>
        </DialogHeader>
        <p className="text-sm text-white/60">Your unsaved entry will be lost.</p>
        <div className="flex gap-3 mt-4">
          <Button
            variant="outline"
            className="flex-1"
            onClick={() => setShowDiscard(false)}
          >
            Cancel
          </Button>
          <Button
            className="flex-1 bg-red-600 hover:bg-red-700 text-white"
            onClick={() => { setShowDiscard(false); onCancel?.() }}
          >
            Discard
          </Button>
        </div>
      </DialogContent>
    </Dialog>

    <motion.form
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      onSubmit={handleSubmit(onSubmit)}
      className="space-y-5"
    >
      {/* Cancel button — only shown when onCancel is provided */}
      {onCancel && (
        <div className="flex items-center justify-between -mt-1 mb-1">
          <p className="text-sm font-semibold text-white">New Entry</p>
          <button
            type="button"
            onClick={handleCancelClick}
            className="w-7 h-7 rounded-lg flex items-center justify-center text-white/30 hover:text-white/70 hover:bg-white/10 transition-all"
            aria-label="Cancel adding entry"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* TMDB Search */}
      <div className="space-y-1.5">
        <Label>Search TMDB (optional)</Label>
        {/* Always search across both movies and TV — type is determined from the TMDB result */}
        <TMDBSearch
          mediaType="all"
          onSelect={handleTMDBSelect}
          placeholder="Search movies and TV series..."
        />
        {tmdbLoading && (
          <p className="text-xs text-blue-400 flex items-center gap-1">
            <Loader2 className="w-3 h-3 animate-spin" />
            Fetching details from TMDB...
          </p>
        )}
      </div>

      {/* Preview */}
      {tmdbData?.posterUrl && (
        <div className="flex gap-4 p-3 bg-white/5 rounded-xl border border-white/10">
          <div className="relative w-16 h-24 flex-shrink-0 rounded-lg overflow-hidden">
            <Image src={tmdbData.posterUrl} alt={tmdbData.title} fill className="object-cover" sizes="64px" />
          </div>
          <div>
            <p className="font-semibold text-white">{tmdbData.title}</p>
            <p className="text-sm text-white/50">{tmdbData.year} · {tmdbData.type}</p>
            {tmdbData.overview && (
              <p className="text-xs text-white/40 mt-1 line-clamp-2">{tmdbData.overview}</p>
            )}
          </div>
        </div>
      )}

      {/* Title */}
      <div className="space-y-1.5">
        <Label htmlFor="title">Title *</Label>
        <Input id="title" placeholder="Movie or series title" {...register('title')} />
        {errors.title && <p className="text-xs text-red-400">{errors.title.message}</p>}
      </div>

      {/* Type + Status row */}
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <Label>Type *</Label>
          <Controller
            name="type"
            control={control}
            render={({ field }) => (
              <Select onValueChange={field.onChange} value={field.value}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="movie">
                    <span className="flex items-center gap-2"><Film className="w-3.5 h-3.5" />Movie</span>
                  </SelectItem>
                  <SelectItem value="series">
                    <span className="flex items-center gap-2"><Tv className="w-3.5 h-3.5" />Series</span>
                  </SelectItem>
                </SelectContent>
              </Select>
            )}
          />
        </div>
        <div className="space-y-1.5">
          <Label>Status *</Label>
          <Controller
            name="status"
            control={control}
            render={({ field }) => (
              <Select onValueChange={field.onChange} value={field.value}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {Object.entries(MEDIA_STATUS_LABELS).map(([val, label]) => (
                    <SelectItem key={val} value={val}>{label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          />
        </div>
      </div>

      {/* Year + Country */}
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <Label>Year Made</Label>
          <Input type="number" placeholder="2024" {...register('yearMade')} />
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

      {/* Rating */}
      <div className="space-y-1.5">
        <Label>Personal Rating (0–10)</Label>
        <div className="flex items-center gap-3">
          <Input
            type="number"
            min={0}
            max={10}
            step={0.01}
            placeholder="8.25"
            className="w-24"
            {...register('personalRating')}
          />
          <div className="flex gap-1">
            {[2, 4, 6, 8, 10].map((v) => (
              <button
                key={v}
                type="button"
                onClick={() => setValue('personalRating', v)}
                className={`w-7 h-7 rounded-lg text-xs font-semibold transition-all ${
                  Number(watchRating) === v
                    ? 'bg-gradient-to-r from-amber-500 to-orange-500 text-white'
                    : 'bg-white/5 border border-white/10 text-white/50 hover:bg-white/10'
                }`}
              >
                {v}
              </button>
            ))}
          </div>
        </div>
        {errors.personalRating && <p className="text-xs text-red-400">{errors.personalRating.message}</p>}
      </div>

      {/* Series-specific fields */}
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
                {...register('seasonNumber', {
                  onChange: (e) => {
                    const n = parseInt(e.target.value, 10)
                    if (!isNaN(n) && n >= 1) handleSeasonChange(n)
                  },
                })}
              />
              {seasonLoading && (
                <span className="text-xs text-blue-400 flex items-center gap-1">
                  <Loader2 className="w-3 h-3 animate-spin" />
                  Loading season data…
                </span>
              )}
              <span className="text-xs text-white/30">Leave blank for full series</span>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Episodes This Season</Label>
              <Input type="number" placeholder="24" {...register('totalEpisodes')} />
            </div>
            <div className="space-y-1.5">
              <Label>Ep Duration (min)</Label>
              <Input type="number" step={0.01} min={0.01} placeholder="22.5" {...register('episodeDurationMinutes')} />
            </div>
          </div>
        </div>
      )}

      {/* Episodes Watched — shown for any non-completed entry (movies & series) */}
      {watchStatus !== 'completed' && (
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
            How many episodes you&apos;ve watched so far. Defaults to 0. Movies count out of 1.
          </p>
        </div>
      )}

      {/* Watch Hours + Age Rating */}
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <Label>Watch Hours</Label>
          <Input type="number" step={0.01} min={0} placeholder="e.g. 7.33" {...register('watchHours')} />
        </div>
        <div className="space-y-1.5">
          <Label>Age Rating</Label>
          <Input placeholder="PG-13, R, TV-MA..." {...register('ageRating')} />
        </div>
      </div>

      {/* Date Finished */}
      <div className="space-y-1.5">
        <Label>Date Finished</Label>
        <div className="flex items-center gap-2">
          <Input type="date" {...register('dateFinished')} className="text-white/70 flex-1" />
          <Button
            type="button"
            variant="outline"
            className="shrink-0 text-xs"
            onClick={() => setValue('dateFinished', new Date().toLocaleDateString('en-CA'), { shouldDirty: true })}
          >
            Set as Today
          </Button>
        </div>
      </div>

      {/* Genres */}
      <div className="space-y-1.5">
        <Label>Genres</Label>
        <div className="flex flex-wrap gap-1.5 mb-2">
          {genres.map((g) => (
            <span
              key={g}
              className="inline-flex items-center gap-1 text-xs bg-blue-600/20 text-blue-400 border border-blue-500/20 rounded-full px-2.5 py-1"
            >
              {g}
              <button type="button" onClick={() => removeGenre(g)}>
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
            onKeyDown={(e) => {
              if (e.key === 'Enter') { e.preventDefault(); addGenre(genreInput) }
            }}
          />
          <Button type="button" variant="outline" size="icon" onClick={() => addGenre(genreInput)}>
            <Plus className="w-4 h-4" />
          </Button>
        </div>
        <div className="flex flex-wrap gap-1.5 mt-1.5">
          {COMMON_GENRES.filter((g) => !genres.includes(g)).slice(0, 10).map((g) => (
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

      {/* Notes */}
      <div className="space-y-1.5">
        <Label>Special Notes</Label>
        <Textarea placeholder="Any thoughts, notes, or review..." {...register('specialNotes')} />
      </div>

      <Button type="submit" className="w-full" size="lg" disabled={isSubmitting}>
        {isSubmitting ? (
          <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Adding...</>
        ) : (
          <><Plus className="w-4 h-4 mr-2" />Add to My List</>
        )}
      </Button>
    </motion.form>
    </>
  )
}
