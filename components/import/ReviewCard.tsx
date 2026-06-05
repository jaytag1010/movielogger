'use client'

import { useState } from 'react'
import { AlertTriangle, Plus, Edit2, Search, CheckCircle } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import { TMDBSearch } from '@/components/media/TMDBSearch'
import { CountrySelect } from '@/components/media/CountrySelect'
import { ImportPreviewRow, ReviewCardEdits } from '@/types/import'
import { NormalizedTMDBResult } from '@/types/tmdb'
import { MediaStatus, MEDIA_STATUS_LABELS } from '@/types/media'
import { fetchMovieMetadata, fetchTVMetadata } from '@/lib/tmdb/api'
import { parseEpisodeDurationRange } from '@/utils/episodeDuration'

interface ReviewCardProps {
  row: ImportPreviewRow
  edits: ReviewCardEdits | undefined
  tmdbLink: NormalizedTMDBResult | undefined
  onSaveEdits: (rowIndex: number, edits: ReviewCardEdits) => void
  onLinkTMDB: (rowIndex: number, result: NormalizedTMDBResult) => void
  onAddOne: (rowIndex: number, immediateEdits?: ReviewCardEdits) => Promise<void>
  loading: boolean
}

type CardMode = 'collapsed' | 'editing' | 'searching'

export function ReviewCard({
  row,
  edits,
  tmdbLink,
  onSaveEdits,
  onLinkTMDB,
  onAddOne,
  loading,
}: ReviewCardProps) {
  const [mode, setMode] = useState<CardMode>('collapsed')
  const [tmdbFetching, setTmdbFetching] = useState(false)

  const linked = !!tmdbLink

  // Local form state — initialised from saved edits or mapped data
  const mapped = row.mapped
  const [title, setTitle] = useState(edits?.title ?? mapped.title ?? '')
  // Type defaults by episode-count heuristic when no explicit type is given:
  // imported totalEpisodes > 1 → series, otherwise movie. This ensures titles
  // with imported episode data are recognised as series in Needs Review.
  const [type, setType] = useState<'movie' | 'series'>(
    edits?.type ??
    (mapped.type as 'movie' | 'series') ??
    ((mapped.totalEpisodes != null && mapped.totalEpisodes > 1) ? 'series' : 'movie')
  )
  const [status, setStatus] = useState<MediaStatus>(
    edits?.status ?? (mapped.status as MediaStatus) ?? 'completed'
  )
  const [yearMade, setYearMade] = useState(String(edits?.yearMade ?? mapped.yearMade ?? ''))
  const [country, setCountry] = useState<string | null>(edits?.country ?? mapped.country ?? null)
  const [genres, setGenres] = useState(
    (edits?.genres ?? mapped.genres ?? []).join(', ')
  )
  const [ageRating, setAgeRating] = useState(edits?.ageRating ?? mapped.ageRating ?? '')
  const [totalEpisodes, setTotalEpisodes] = useState(
    String(edits?.totalEpisodes ?? mapped.totalEpisodes ?? '')
  )
  const [episodeDuration, setEpisodeDuration] = useState(
    String(edits?.episodeDurationMinutes ?? mapped.episodeAverageDuration ?? mapped.episodeDurationMinutes ?? '')
  )
  const [watchHoursManual, setWatchHoursManual] = useState(
    String(edits?.watchHours ?? mapped.watchHours ?? '')
  )

  // For series: watch hours are always auto-calculated from episodes × duration
  const isSeries = type === 'series'
  const calculatedSeriesHours: string = (() => {
    const eps = totalEpisodes ? parseFloat(totalEpisodes) : null
    const dur = episodeDuration ? parseFloat(episodeDuration) : (mapped.episodeAverageDuration ?? null)
    if (eps != null && eps > 0 && dur != null && dur > 0) {
      return String(Math.round((eps * dur / 60) * 100) / 100)
    }
    return ''
  })()
  const watchHours = isSeries ? calculatedSeriesHours : watchHoursManual
  const [personalRating, setPersonalRating] = useState(
    String(edits?.personalRating ?? mapped.personalRating ?? '')
  )
  const [notes, setNotes] = useState(edits?.specialNotes ?? mapped.specialNotes ?? '')

  function collectEdits(): ReviewCardEdits {
    return {
      title: title || undefined,
      type,
      status,
      yearMade: yearMade ? parseInt(yearMade) : null,
      country: country || null,
      genres: genres ? genres.split(',').map((g) => g.trim()).filter(Boolean) : [],
      ageRating: ageRating || null,
      totalEpisodes: totalEpisodes ? parseInt(totalEpisodes) : null,
      episodeDurationMinutes: episodeDuration ? parseFloat(episodeDuration) : null,
      watchHours: watchHours ? parseFloat(watchHours) : null,
      personalRating: personalRating ? parseFloat(personalRating) : null,
      specialNotes: notes || null,
    }
  }

  async function handleTMDBSelect(result: NormalizedTMDBResult) {
    // Immediately populate sparse fields from the search result
    if (result.title) setTitle(result.title)
    if (result.type) setType(result.type)
    if (result.year) setYearMade(String(result.year))
    if (result.country) setCountry(result.country)

    // Store the sparse result first so "TMDB Linked" badge appears immediately
    onLinkTMDB(row.rowIndex, result)

    // Fetch full metadata: search results omit genres, ageRating, totalEpisodes, runtime.
    // The full result replaces the sparse one in reviewTmdbLinks so buildEntryInput
    // doesn't need to re-fetch during the actual import.
    setTmdbFetching(true)
    try {
      const full = result.type === 'series'
        ? await fetchTVMetadata(result.tmdbId)
        : await fetchMovieMetadata(result.tmdbId)

      onLinkTMDB(row.rowIndex, full)

      if (full.genres && full.genres.length > 0) setGenres(full.genres.join(', '))
      if (full.ageRating) setAgeRating(full.ageRating)
      if (full.country) setCountry(full.country)
      if (full.year) setYearMade(String(full.year))
      if (full.totalEpisodes != null) setTotalEpisodes(String(full.totalEpisodes))
      if (full.runtime != null) setEpisodeDuration(String(full.runtime))

      // For movies: set watch hours from runtime. Series auto-derive from the
      // calculatedSeriesHours expression when totalEpisodes/episodeDuration change.
      if (full.type !== 'series') {
        const dur = full.runtime ?? parseEpisodeDurationRange(episodeDuration)
        if (dur != null) {
          setWatchHoursManual(String(Math.round((dur / 60) * 100) / 100))
        }
      }
    } catch {
      // Full fetch failed — sparse result remains linked; buildEntryInput will
      // attempt its own full fetch during the actual import.
    } finally {
      setTmdbFetching(false)
    }
  }

  function handleSave() {
    onSaveEdits(row.rowIndex, collectEdits())
    setMode('collapsed')
  }

  async function handleAddToList() {
    const currentEdits = collectEdits()
    onSaveEdits(row.rowIndex, currentEdits)
    // Pass edits directly — onSaveEdits queues a React state update that
    // won't flush before onAddOne reads reviewEdits from its closure.
    await onAddOne(row.rowIndex, currentEdits)
  }

  const displayTitle = edits?.title ?? mapped.title ?? '—'
  const isExpanded = mode === 'editing' || mode === 'searching'

  return (
    <div className="border border-white/10 rounded-xl overflow-hidden bg-white/[0.03]">
      {/* Card header — always visible */}
      <div className="flex items-start gap-3 px-4 py-3">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <p className="text-sm font-medium text-white truncate">{displayTitle}</p>
            {linked && (
              <Badge className="text-[10px] bg-blue-500/20 text-blue-400 border border-blue-500/30 px-1.5 py-0 flex items-center gap-1 flex-shrink-0">
                {tmdbFetching
                  ? <span className="w-2.5 h-2.5 border border-blue-400/40 border-t-blue-400 rounded-full animate-spin" />
                  : <CheckCircle className="w-2.5 h-2.5" />}
                {tmdbFetching ? 'Fetching…' : 'TMDB Linked'}
              </Badge>
            )}
          </div>
          {row.reviewReason && (
            <div className="flex items-center gap-1.5 mt-0.5">
              <AlertTriangle className="w-3 h-3 text-amber-400 flex-shrink-0" />
              <p className="text-xs text-amber-400/80">{row.reviewReason}</p>
            </div>
          )}
          {!row.reviewReason && (
            <p className="text-xs text-white/30 mt-0.5">No confident TMDB match found</p>
          )}

          {/* Imported metadata summary — always visible in collapsed state */}
          {!isExpanded && (
            <div className="flex items-center gap-x-3 gap-y-0.5 flex-wrap mt-1.5 text-[11px] text-white/40">
              {yearMade && <span>{yearMade}</span>}
              {country && <span>{country}</span>}
              {type && <span className={type === 'series' ? 'text-blue-400/60' : 'text-purple-400/60'}>{type === 'series' ? 'Series' : 'Movie'}</span>}
              {totalEpisodes && <span>{totalEpisodes} eps</span>}
              {episodeDuration && <span>{episodeDuration} min/ep</span>}
              {watchHours && <span>{watchHours} hrs</span>}
              {personalRating && <span>★ {personalRating}</span>}
            </div>
          )}
        </div>

        <div className="flex items-center gap-1.5 flex-shrink-0">
          {!isExpanded && (
            <>
              <Button
                size="sm"
                variant="ghost"
                className="h-7 px-2 text-xs text-white/50 hover:text-white"
                onClick={() => setMode('searching')}
                disabled={loading}
              >
                <Search className="w-3 h-3 mr-1" />
                Search TMDB
              </Button>
              <Button
                size="sm"
                variant="ghost"
                className="h-7 px-2 text-xs text-white/50 hover:text-white"
                onClick={() => setMode('editing')}
                disabled={loading}
              >
                <Edit2 className="w-3 h-3 mr-1" />
                Edit
              </Button>
            </>
          )}
          <Button
            size="sm"
            variant="ghost"
            className="h-7 w-7 p-0 text-emerald-400 hover:text-emerald-300 hover:bg-emerald-500/10"
            onClick={() => onAddOne(row.rowIndex)}
            disabled={loading}
            title="Quick add to list"
          >
            <Plus className="w-4 h-4" />
          </Button>
        </div>
      </div>

      {/* Expanded editing form */}
      {isExpanded && (
        <div className="px-4 pb-4 space-y-3 border-t border-white/10 pt-3">
          {/* TMDB search */}
          <div>
            <p className="text-xs text-white/40 mb-1.5">TMDB Search (optional)</p>
            <TMDBSearch
              mediaType="all"
              onSelect={handleTMDBSelect}
              defaultQuery={mode === 'searching' ? (mapped.title ?? '') : undefined}
              key={mode}
            />
          </div>

          <div className="border-t border-white/10" />

          {/* Form fields */}
          <div className="grid grid-cols-2 gap-3">
            <div className="col-span-2">
              <label className="text-xs text-white/40 mb-1 block">Title</label>
              <Input
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                className="h-8 text-sm bg-white/5 border-white/10"
              />
            </div>

            <div>
              <label className="text-xs text-white/40 mb-1 block">Status</label>
              <Select value={status} onValueChange={(v) => setStatus(v as MediaStatus)}>
                <SelectTrigger className="h-8 text-sm bg-white/5 border-white/10">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {(Object.entries(MEDIA_STATUS_LABELS) as [MediaStatus, string][]).map(([val, label]) => (
                    <SelectItem key={val} value={val}>{label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div>
              <label className="text-xs text-white/40 mb-1 block">Type</label>
              <Select value={type} onValueChange={(v) => setType(v as 'movie' | 'series')}>
                <SelectTrigger className="h-8 text-sm bg-white/5 border-white/10">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="movie">Movie</SelectItem>
                  <SelectItem value="series">Series</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div>
              <label className="text-xs text-white/40 mb-1 block">Year</label>
              <Input
                type="number"
                value={yearMade}
                onChange={(e) => setYearMade(e.target.value)}
                className="h-8 text-sm bg-white/5 border-white/10"
                placeholder="e.g. 2024"
              />
            </div>

            <div>
              <label className="text-xs text-white/40 mb-1 block">Age Rating</label>
              <Input
                value={ageRating}
                onChange={(e) => setAgeRating(e.target.value)}
                className="h-8 text-sm bg-white/5 border-white/10"
                placeholder="e.g. TV-14"
              />
            </div>

            <div className="col-span-2">
              <label className="text-xs text-white/40 mb-1 block">Country</label>
              <CountrySelect value={country} onChange={setCountry} />
            </div>

            <div className="col-span-2">
              <label className="text-xs text-white/40 mb-1 block">Genres (comma-separated)</label>
              <Input
                value={genres}
                onChange={(e) => setGenres(e.target.value)}
                className="h-8 text-sm bg-white/5 border-white/10"
                placeholder="e.g. Drama, Comedy"
              />
            </div>

            {type === 'series' && (
              <>
                <div>
                  <label className="text-xs text-white/40 mb-1 block">Total Episodes</label>
                  <Input
                    type="number"
                    value={totalEpisodes}
                    onChange={(e) => setTotalEpisodes(e.target.value)}
                    className="h-8 text-sm bg-white/5 border-white/10"
                  />
                </div>
                <div>
                  <label className="text-xs text-white/40 mb-1 block">Ep Duration (min)</label>
                  <Input
                    type="number"
                    value={episodeDuration}
                    onChange={(e) => setEpisodeDuration(e.target.value)}
                    className="h-8 text-sm bg-white/5 border-white/10"
                  />
                </div>
              </>
            )}

            <div>
              <label className="text-xs text-white/40 mb-1 block">Watch Hours</label>
              <Input
                type="number"
                step="0.01"
                value={watchHours}
                onChange={(e) => !isSeries && setWatchHoursManual(e.target.value)}
                readOnly={isSeries}
                className={`h-8 text-sm border-white/10 ${isSeries ? 'bg-white/[0.02] text-white/50 cursor-not-allowed' : 'bg-white/5'}`}
              />
              {isSeries && (
                <p className="text-[10px] text-white/30 mt-0.5">Auto-calculated from Episodes × Duration</p>
              )}
            </div>

            <div>
              <label className="text-xs text-white/40 mb-1 block">Personal Rating</label>
              <Input
                type="number"
                step="0.25"
                min="0"
                max="10"
                value={personalRating}
                onChange={(e) => setPersonalRating(e.target.value)}
                className="h-8 text-sm bg-white/5 border-white/10"
              />
            </div>

            <div className="col-span-2">
              <label className="text-xs text-white/40 mb-1 block">Notes</label>
              <Textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                className="text-sm bg-white/5 border-white/10 min-h-[60px]"
                rows={2}
              />
            </div>
          </div>

          {/* Card action buttons */}
          <div className="flex gap-2 pt-1">
            <Button
              size="sm"
              variant="ghost"
              onClick={() => setMode('collapsed')}
              className="text-white/50 hover:text-white"
              disabled={loading}
            >
              Cancel
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={handleSave}
              disabled={loading}
            >
              Save
            </Button>
            <Button
              size="sm"
              onClick={handleAddToList}
              disabled={loading}
              className="ml-auto"
            >
              {loading ? (
                <span className="w-3.5 h-3.5 border-2 border-white/20 border-t-white rounded-full animate-spin" />
              ) : (
                'Add to List'
              )}
            </Button>
          </div>
        </div>
      )}
    </div>
  )
}
