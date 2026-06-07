'use client'

import { useState, useEffect, useRef } from 'react'
import Image from 'next/image'
import { useForm, Controller } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { toast } from 'sonner'
import { Loader2, X, Plus, Search, Upload, ImageIcon } from 'lucide-react'
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
import { NormalizedTMDBResult } from '@/types/tmdb'
import { useMedia } from '@/hooks/useMedia'
import { useTMDBDetails, useTMDBSeasonDetails } from '@/hooks/useTMDB'
import { fetchTVMetadata } from '@/lib/tmdb/api'
import { CountrySelect } from './CountrySelect'
import { TMDBSearch } from './TMDBSearch'
import { uploadPoster, deletePoster, validatePosterFile } from '@/lib/imgbb'
import { getDisplayPosterUrl } from '@/utils/formatters'
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
  // Blank or empty → null (treated as Season 1 on save). Non-blank must be ≥ 1.
  seasonNumber: z.preprocess(
    (v) => (v === '' || v == null ? null : v),
    z.coerce.number().int().min(1).nullable().optional()
  ),
  nextEpisodeToWatch: z.coerce.number().int().min(0).nullable().optional(),
  yearMade: z.coerce.number().nullable().optional(),
  totalEpisodes: z.coerce.number().nullable().optional(),
  episodeDurationMinutes: z.coerce.number().min(0.01).nullable().optional(),
  watchHours: z.coerce.number().nullable().optional(),
  personalRating: z.coerce.number().min(0).max(10).nullable().optional(),
  ageRating: z.string().nullable().optional(),
  country: z.string().nullable().optional(),
  dateFinished: z.string().nullable().optional(),
  specialNotes: z.string().nullable().optional(),
})

type FormData = z.infer<typeof schema>

// Pending TMDB link action — null = no user action this session.
type TmdbChanges = {
  tmdbId: number | null
  posterUrl: string | null
  backdropUrl: string | null
  releaseDate: string | null
} | null

interface EditEntryModalProps {
  entry: MediaEntry | null
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function EditEntryModal({ entry, open, onOpenChange }: EditEntryModalProps) {
  const { editEntry, entries } = useMedia()

  // ── TMDB hooks ───────────────────────────────────────────────────────────
  const { fetchDetails, loading: tmdbLinking }           = useTMDBDetails()
  const { fetchSeason, loading: seasonConfirmLoading }   = useTMDBSeasonDetails()

  // ── Form ────────────────────────────────────────────────────────────────
  const { register, handleSubmit, setValue, control, reset, watch, formState: { errors, isSubmitting } } =
    useForm<FormData>({ resolver: zodResolver(schema) })

  const watchType          = watch('type')
  const watchTotalEpisodes = watch('totalEpisodes')
  const watchEpDuration    = watch('episodeDurationMinutes')

  const isSeriesType = watchType === 'series'
  const calculatedSeriesWatchHours: number | null = (() => {
    if (!isSeriesType) return null
    const eps = watchTotalEpisodes ?? null
    const dur = watchEpDuration   ?? null
    if (eps != null && eps > 0 && dur != null && dur > 0) {
      return Math.round((eps * dur / 60) * 100) / 100
    }
    return null
  })()

  // ── Genre state ──────────────────────────────────────────────────────────
  const [genres, setGenres]         = useState<string[]>([])
  const [genreInput, setGenreInput] = useState('')

  // ── TMDB link state ───────────────────────────────────────────────────────
  const [showTmdbSearch, setShowTmdbSearch] = useState(false)
  const [tmdbChanges, setTmdbChanges]       = useState<TmdbChanges>(null)

  const currentTmdbId = tmdbChanges !== null ? tmdbChanges.tmdbId : (entry?.tmdbId ?? null)

  // ── Manual poster state ──────────────────────────────────────────────────
  const fileInputRef                            = useRef<HTMLInputElement>(null)
  const [posterFile, setPosterFile]             = useState<File | null>(null)
  const [posterPreviewUrl, setPosterPreviewUrl] = useState<string | null>(null)
  const [removingPoster, setRemovingPoster]     = useState(false)
  // NOTE: no separate uploadingPoster state — isSubmitting from react-hook-form
  // already disables the button for the entire onSubmit duration.

  // What to show in the poster thumbnail inside the modal:
  //   pending local preview > existing manual poster > TMDB poster
  //   (if removing manual: TMDB poster becomes visible)
  const activeTmdbPoster   = tmdbChanges !== null ? tmdbChanges.posterUrl : (entry?.posterUrl ?? null)
  const activeManualPoster = removingPoster ? null : (posterPreviewUrl ?? (entry?.manualPosterUrl ?? null))
  const modalPosterDisplay = posterPreviewUrl
    ? posterPreviewUrl                            // local preview always wins
    : removingPoster
      ? (activeTmdbPoster ?? null)               // removing manual → show TMDB if any
      : (activeManualPoster ?? activeTmdbPoster) // manual > TMDB default

  // ── Populate form on entry change ────────────────────────────────────────
  useEffect(() => {
    if (entry) {
      reset({
        title:                  entry.title,
        type:                   entry.type,
        status:                 entry.status,
        seasonNumber:           entry.seasonNumber           ?? undefined,
        nextEpisodeToWatch:     entry.nextEpisodeToWatch     ?? undefined,
        yearMade:               entry.yearMade               ?? undefined,
        totalEpisodes:          entry.totalEpisodes          ?? undefined,
        episodeDurationMinutes: entry.episodeDurationMinutes ?? undefined,
        watchHours:             entry.watchHours             ?? undefined,
        personalRating:         entry.personalRating         ?? undefined,
        ageRating:              entry.ageRating              ?? '',
        country:                entry.country                ?? '',
        dateFinished:           entry.dateFinished
          ? format(entry.dateFinished.toDate(), 'yyyy-MM-dd')
          : '',
        specialNotes: entry.specialNotes ?? '',
      })
      setGenres(entry.genres || [])
      setShowTmdbSearch(false)
      setTmdbChanges(null)
      setPosterFile(null)
      setPosterPreviewUrl(null)
      setRemovingPoster(false)
    }
  }, [entry, reset])

  function addGenre(g: string) {
    const trimmed = g.trim()
    if (trimmed && !genres.includes(trimmed)) setGenres([...genres, trimmed])
    setGenreInput('')
  }

  // ── TMDB link — fetch full metadata and overwrite authoritative fields ───
  async function handleTmdbSelect(r: NormalizedTMDBResult) {
    // Fetch full TMDB data so Country, Age Rating, and other sparse fields
    // that search results return as null are properly populated.
    const fullData = await fetchDetails(r.tmdbId, r.type as 'movie' | 'series')
    const d = fullData ?? r   // fall back to sparse search result if fetch fails

    // Overwrite TMDB-authoritative fields unconditionally (no null guards).
    // These always reflect TMDB's data so the entry stays in sync after relinking.
    setValue('type', d.type)
    if (d.year          != null) setValue('yearMade',               d.year)
    if (d.totalEpisodes != null) setValue('totalEpisodes',          d.totalEpisodes)
    if (d.runtime       != null) setValue('episodeDurationMinutes', d.runtime)
    // Country and ageRating: always overwrite when TMDB provides a value
    // (search results have null here; full fetch always has the real value)
    if (d.country  !== null && d.country  !== undefined) setValue('country',  d.country  ?? '')
    if (d.ageRating !== null && d.ageRating !== undefined) setValue('ageRating', d.ageRating ?? '')
    if (d.genres.length > 0) setGenres(d.genres)

    setTmdbChanges({ tmdbId: d.tmdbId, posterUrl: d.posterUrl, backdropUrl: d.backdropUrl, releaseDate: d.releaseDate ?? null })

    // Clear any pending manual poster upload — TMDB poster becomes the active default.
    // (Existing saved manualPosterUrl is untouched; user can remove it explicitly.)
    if (posterPreviewUrl) URL.revokeObjectURL(posterPreviewUrl)
    setPosterFile(null)
    setPosterPreviewUrl(null)

    setShowTmdbSearch(false)
    toast.success(`Linked to "${d.title}" on TMDB`)
  }

  // ── Season Confirm — fetch season-specific episodes & duration ────────────
  async function handleSeasonConfirm() {
    const tmdbId    = currentTmdbId
    const seasonNum = watch('seasonNumber')
    if (!tmdbId || !seasonNum) return

    try {
      // Try season-specific data first
      const seasonData = await fetchSeason(tmdbId, seasonNum)
      if (seasonData && (seasonData.episodeCount || seasonData.avgRuntime)) {
        if (seasonData.episodeCount) setValue('totalEpisodes',          seasonData.episodeCount)
        if (seasonData.avgRuntime)   setValue('episodeDurationMinutes', seasonData.avgRuntime)
        toast.success(`Season ${seasonNum} data loaded`)
      } else {
        // Fallback: series-level episode data from TMDB
        try {
          const seriesData = await fetchTVMetadata(tmdbId)
          if (seriesData.totalEpisodes) setValue('totalEpisodes', seriesData.totalEpisodes)
          if (seriesData.runtime)       setValue('episodeDurationMinutes', seriesData.runtime)
          toast.info('Season-specific data unavailable — using series-level data')
        } catch {
          toast.error('Could not load episode data from TMDB')
        }
      }
    } catch {
      toast.error('Could not load season data from TMDB')
    }
  }

  // ── Remove TMDB link ──────────────────────────────────────────────────────
  function handleTmdbRemove() {
    setTmdbChanges({ tmdbId: null, posterUrl: null, backdropUrl: null, releaseDate: null })
    setShowTmdbSearch(false)
    toast.info('TMDB link will be removed when you save')
  }

  // ── Manual poster file selection ─────────────────────────────────────────
  function handlePosterFileSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    try {
      validatePosterFile(file)
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'Invalid file')
      return
    }
    // Revoke previous preview URL to avoid memory leaks.
    if (posterPreviewUrl) URL.revokeObjectURL(posterPreviewUrl)
    const url = URL.createObjectURL(file)
    setPosterFile(file)
    setPosterPreviewUrl(url)
    setRemovingPoster(false)
    // Reset the file input so the same file can be re-selected.
    e.target.value = ''
  }

  function handlePosterRemove() {
    if (posterPreviewUrl) {
      URL.revokeObjectURL(posterPreviewUrl)
      setPosterPreviewUrl(null)
    }
    setPosterFile(null)
    setRemovingPoster(true)
  }

  // ── Submit ────────────────────────────────────────────────────────────────
  async function onSubmit(data: FormData) {
    if (!entry?.id) return
    try {
      const watched = data.nextEpisodeToWatch ?? 0
      const recordedTotal = data.totalEpisodes ?? null
      let correctedTotal: number | null
      if (data.type === 'movie') {
        correctedTotal = recordedTotal ?? 1
      } else if (
        data.status === 'completed' &&
        watched > 0 &&
        (recordedTotal == null || watched > recordedTotal)
      ) {
        correctedTotal = watched
      } else {
        correctedTotal = recordedTotal
      }
      const episodesWatched = data.status === 'completed' ? null : watched

      // Resolve metadata link fields.
      //   • metadataChanges set        → honour explicit user action (rematch or removal)
      //   • type changed + was linked  → auto-clear to avoid stale link conflict
      //   • otherwise                  → no change (leave Firestore fields as-is)
      const typeChanged = data.type !== entry.type
      const wasTmdbLinked = entry.tmdbId != null
      const tmdbFields: Record<string, unknown> =
        tmdbChanges !== null
          ? { tmdbId: tmdbChanges.tmdbId, posterUrl: tmdbChanges.posterUrl, backdropUrl: tmdbChanges.backdropUrl, tmdbReleaseDate: tmdbChanges.releaseDate }
          : typeChanged && wasTmdbLinked
            ? { tmdbId: null, posterUrl: null, backdropUrl: null, tmdbReleaseDate: null }
            : {}

      // Resolve manual poster.
      let newManualPosterUrl: string | null = entry.manualPosterUrl ?? null
      if (removingPoster) {
        // deletePoster is a no-op on ImgBB free tier; just clear the Firestore field.
        await deletePoster()
        newManualPosterUrl = null
      } else if (posterFile) {
        newManualPosterUrl = await uploadPoster(posterFile)
      }

      await editEntry(entry.id, {
        title:                  data.title,
        type:                   data.type,
        status:                 data.status,
        // Default season to 1 for series when left blank (Improvement 05).
        seasonNumber:           data.type === 'series' ? (data.seasonNumber ?? 1) : null,
        nextEpisodeToWatch:     episodesWatched,
        yearMade:               data.yearMade               ?? null,
        totalEpisodes:          correctedTotal,
        episodeDurationMinutes: data.episodeDurationMinutes ?? null,
        watchHours:             isSeriesType ? (calculatedSeriesWatchHours ?? null) : (data.watchHours ?? null),
        personalRating:         data.personalRating         ?? null,
        ageRating:              data.ageRating              || null,
        genres,
        country:                data.country                || null,
        dateFinished:           data.dateFinished
          ? Timestamp.fromDate(new Date(data.dateFinished))
          : null,
        specialNotes:  data.specialNotes || null,
        manualPosterUrl: newManualPosterUrl,
        ...tmdbFields,
      })

      // Contextual success message.
      if (tmdbChanges?.tmdbId != null) {
        toast.success('Entry updated with new TMDB match')
      } else if (tmdbChanges?.tmdbId === null) {
        toast.success('Entry updated — TMDB link removed')
      } else if (typeChanged && wasTmdbLinked) {
        toast.success('Type updated — TMDB link removed. Use "Search TMDB" to relink.')
      } else {
        toast.success('Entry updated')
      }
      onOpenChange(false)
    } catch (err: unknown) {
      console.error(err)
      toast.error(err instanceof Error ? err.message : 'Failed to update entry')
    }
  }

  const hasManualPoster = !!(posterFile || (entry?.manualPosterUrl && !removingPoster))

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Edit Entry</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4 mt-2">

          {/* ── Title ── */}
          <div className="space-y-1.5">
            <Label>Title *</Label>
            <Input {...register('title')} />
            {errors.title && <p className="text-xs text-red-400">{errors.title.message}</p>}
          </div>

          {/* ── TMDB Link (top, always visible) ── */}
          <div className="rounded-xl border border-white/10 bg-white/[0.02] p-3 space-y-2.5">
            <div className="flex items-start gap-2 justify-between">
              <div className="min-w-0">
                <p className="text-sm font-medium text-white">TMDB Link</p>
                <p className="text-xs text-white/40 mt-0.5 truncate">
                  {tmdbChanges?.tmdbId === null
                    ? 'Will be unlinked on save'
                    : currentTmdbId != null
                      ? `Linked — TMDB #${currentTmdbId}`
                      : 'Not linked to TMDB'}
                </p>
              </div>
              <div className="flex gap-1.5 flex-shrink-0">
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  className="h-7 text-xs px-2"
                  onClick={() => setShowTmdbSearch((v) => !v)}
                  disabled={tmdbLinking}
                >
                  {tmdbLinking
                    ? <Loader2 className="w-3 h-3 animate-spin" />
                    : <Search className="w-3 h-3 mr-1" />}
                  {tmdbLinking ? 'Linking…' : showTmdbSearch ? 'Cancel' : 'Search TMDB'}
                </Button>
                {currentTmdbId != null && tmdbChanges?.tmdbId !== null && (
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    className="h-7 text-xs px-2 text-red-400/70 hover:text-red-400 hover:bg-red-400/10"
                    onClick={handleTmdbRemove}
                  >
                    <X className="w-3 h-3 mr-1" />
                    Remove
                  </Button>
                )}
              </div>
            </div>
            {/* Type-change auto-clear warning */}
            {watchType !== entry?.type && entry?.tmdbId != null && tmdbChanges === null && (
              <p className="text-[10px] text-amber-400/80 leading-tight">
                ⚠️ Changing type will remove the TMDB link. Use "Search TMDB" above to relink first.
              </p>
            )}
            {showTmdbSearch && (
              <TMDBSearch
                defaultQuery={watch('title')}
                onSelect={handleTmdbSelect}
              />
            )}
          </div>

          {/* ── Type & Status ── */}
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

          {/* ── Year & Country ── */}
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

          {/* ── Rating & Age Rating ── */}
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

          {/* ── Series-only fields ── */}
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
                  {currentTmdbId ? (
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      className="h-8 text-xs px-2.5"
                      onClick={handleSeasonConfirm}
                      disabled={seasonConfirmLoading || !watch('seasonNumber')}
                      title="Fetch episode count and duration from TMDB for this season"
                    >
                      {seasonConfirmLoading
                        ? <Loader2 className="w-3 h-3 animate-spin" />
                        : 'Confirm'}
                    </Button>
                  ) : (
                    <span className="text-xs text-white/30">Leave blank for full series</span>
                  )}
                </div>
                {currentTmdbId && (
                  <p className="text-[10px] text-white/30">
                    Press Confirm to auto-fill Episodes &amp; Duration from TMDB
                  </p>
                )}
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label>Episodes This Season</Label>
                  <Input type="number" {...register('totalEpisodes')} />
                </div>
                <div className="space-y-1.5">
                  <Label>Ep Duration (min)</Label>
                  <Input
                    type="number"
                    step={0.01}
                    min={0.01}
                    placeholder="22.5"
                    {...register('episodeDurationMinutes')}
                  />
                </div>
              </div>
            </div>
          )}

          {/* ── Episodes Watched (non-completed) ── */}
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

          {/* ── Watch Hours & Date Finished ── */}
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
                <Input type="number" step={0.01} min={0} placeholder="e.g. 7.33" {...register('watchHours')} />
              )}
            </div>
            <div className="space-y-1.5">
              <Label>Date Finished</Label>
              <Input type="date" {...register('dateFinished')} className="text-white/70" />
            </div>
          </div>

          {/* ── Genres ── */}
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

          {/* ── Manual Poster Upload ── */}
          <div className="rounded-xl border border-white/10 bg-white/[0.02] p-3">
            <div className="flex items-start gap-3">
              {/* Thumbnail */}
              <div className="relative w-12 h-[72px] flex-shrink-0 rounded-lg overflow-hidden bg-white/5 border border-white/10">
                {modalPosterDisplay ? (
                  <Image
                    src={modalPosterDisplay}
                    alt="Poster preview"
                    fill
                    className="object-cover"
                    sizes="48px"
                    unoptimized={!!posterPreviewUrl} // local blob: skip Next.js optimisation
                  />
                ) : (
                  <div className="w-full h-full flex items-center justify-center">
                    <ImageIcon className="w-4 h-4 text-white/20" />
                  </div>
                )}
              </div>

              {/* Controls */}
              <div className="flex-1 min-w-0 space-y-1.5">
                <p className="text-sm font-medium text-white">Poster</p>
                <p className="text-xs text-white/40">
                  {hasManualPoster
                    ? activeTmdbPoster
                      ? 'Manual upload (overrides TMDB)'
                      : 'Manual upload'
                    : activeTmdbPoster
                      ? 'TMDB poster'
                      : 'No poster — upload one below'}
                </p>
                <div className="flex flex-wrap gap-1.5 mt-1">
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    className="h-7 text-xs px-2"
                    onClick={() => fileInputRef.current?.click()}
                  >
                    <Upload className="w-3 h-3 mr-1" />
                    {hasManualPoster ? 'Replace Poster' : 'Upload Poster'}
                  </Button>
                  {hasManualPoster && (
                    <Button
                      type="button"
                      size="sm"
                      variant="ghost"
                      className="h-7 text-xs px-2 text-red-400/70 hover:text-red-400 hover:bg-red-400/10"
                      onClick={handlePosterRemove}
                    >
                      <X className="w-3 h-3 mr-1" />
                      Remove Poster
                    </Button>
                  )}
                </div>
                {posterFile && (
                  <p className="text-[10px] text-emerald-400/80">
                    ✓ {posterFile.name} selected — will upload on save
                  </p>
                )}
                {removingPoster && (
                  <p className="text-[10px] text-amber-400/80">
                    Manual poster will be removed on save
                  </p>
                )}
              </div>
            </div>
            {/* Hidden file input */}
            <input
              ref={fileInputRef}
              type="file"
              accept="image/jpeg,image/jpg,image/png,image/webp"
              className="hidden"
              onChange={handlePosterFileSelect}
            />
          </div>

          {/* ── Notes ── */}
          <div className="space-y-1.5">
            <Label>Notes</Label>
            <Textarea {...register('specialNotes')} rows={2} />
          </div>

          {/* ── Actions ── */}
          <div className="flex gap-3 pt-1">
            <Button type="button" variant="outline" className="flex-1" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" className="flex-1" disabled={isSubmitting}>
              {isSubmitting
                ? <Loader2 className="w-4 h-4 animate-spin" />
                : 'Save Changes'}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  )
}
