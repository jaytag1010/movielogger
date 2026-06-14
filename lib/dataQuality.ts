import { MediaEntry } from '@/types/media'
import { calculateEntryWatchHours } from '@/utils/watchTime'

// ── Types ──────────────────────────────────────────────────────────────────

export interface DuplicateGroup {
  key: string
  reason: 'tmdb' | 'title'
  entries: MediaEntry[]
}

export interface DataQualityResult {
  classification: MediaEntry[]
  duplicates: DuplicateGroup[]
  missingRuntime: MediaEntry[]
  missingCountry: MediaEntry[]
  missingPoster: MediaEntry[]
  missingRating: MediaEntry[]
  missingDateFinished: MediaEntry[]
  missingGenres: MediaEntry[]
  missingEpisodeProgress: MediaEntry[]
  /** Total unresolved issue count shown on the bell badge. */
  totalCount: number
}

// ── Helpers ────────────────────────────────────────────────────────────────

function normaliseTitle(title: string): string {
  return title.toLowerCase().replace(/\([^)]*\)/g, '').replace(/[^a-z0-9]/g, '').trim()
}

/** Classification conflict: stored type disagrees with episode count. */
export function hasClassificationConflict(entry: MediaEntry): boolean {
  const eps = entry.totalEpisodes
  if (entry.type === 'movie' && eps != null && eps > 1) return true
  if (entry.type === 'series' && eps != null && eps <= 1) return true
  return false
}

/** True when runtime is unavailable AND watch hours cannot be derived. */
export function hasMissingRuntime(entry: MediaEntry): boolean {
  return entry.episodeDurationMinutes == null && calculateEntryWatchHours(entry) === 0
}

export function hasMissingCountry(entry: MediaEntry): boolean {
  return !entry.country || entry.country.trim() === ''
}

export function hasMissingPoster(entry: MediaEntry): boolean {
  const hasTmdb   = !!entry.posterUrl    && entry.posterUrl.trim()    !== ''
  const hasManual = !!entry.manualPosterUrl && entry.manualPosterUrl.trim() !== ''
  return !hasTmdb && !hasManual
}

/** Completed titles with no personal rating or a rating of 0 (likely unfilled). */
export function hasMissingRating(entry: MediaEntry): boolean {
  return entry.status === 'completed' && (entry.personalRating == null || entry.personalRating === 0)
}

/** Completed titles missing a finish date. */
export function hasMissingDateFinished(entry: MediaEntry): boolean {
  return entry.status === 'completed' && entry.dateFinished == null
}

/** Titles with no genres recorded. */
export function hasMissingGenres(entry: MediaEntry): boolean {
  return !entry.genres || entry.genres.length === 0
}

/** In-progress (watching) series with no episode progress recorded. */
export function hasMissingEpisodeProgress(entry: MediaEntry): boolean {
  return entry.status === 'watching' && entry.type === 'series' && entry.nextEpisodeToWatch == null
}

// ── Engine ─────────────────────────────────────────────────────────────────

export function computeDataQuality(
  entries: MediaEntry[],
  ignoredDuplicateKeys: Set<string> = new Set()
): DataQualityResult {
  const classification = entries.filter(hasClassificationConflict)
  const missingRuntime = entries.filter(hasMissingRuntime)
  const missingCountry = entries.filter(hasMissingCountry)
  const missingPoster = entries.filter(hasMissingPoster)
  const missingRating = entries.filter(hasMissingRating)
  const missingDateFinished = entries.filter(hasMissingDateFinished)
  const missingGenres = entries.filter(hasMissingGenres)
  const missingEpisodeProgress = entries.filter(hasMissingEpisodeProgress)

  // ── Duplicate detection ──
  const duplicates: DuplicateGroup[] = []
  const seenInTmdbGroup = new Set<string>() // entry ids already grouped by tmdbId

  // 1. Same TMDB ID (season-aware — different seasons are legitimately distinct)
  const byTmdb = new Map<string, MediaEntry[]>()
  for (const e of entries) {
    if (e.tmdbId == null) continue
    const key = `tmdb:${e.tmdbId}-${e.seasonNumber ?? 'all'}`
    const arr = byTmdb.get(key) ?? []
    arr.push(e)
    byTmdb.set(key, arr)
  }
  for (const [key, group] of Array.from(byTmdb.entries())) {
    if (group.length > 1) {
      group.forEach((e: MediaEntry) => e.id && seenInTmdbGroup.add(e.id))
      if (!ignoredDuplicateKeys.has(key)) {
        duplicates.push({ key, reason: 'tmdb', entries: group })
      }
    }
  }

  // 2. Title-based duplicates (not already captured by a TMDB-id group).
  //
  //    A genuine duplicate requires the same title AND the same country AND
  //    the same year. For TV series, season number must also match — different
  //    seasons of the same show are intentionally tracked as separate entries.
  //
  //    Key structure:
  //      title:<normTitle>|<country>|<year>|<season>
  //    where country/year/season use '' when absent so sparse data still groups.
  const byTitle = new Map<string, MediaEntry[]>()
  for (const e of entries) {
    if (e.id && seenInTmdbGroup.has(e.id)) continue
    const norm = normaliseTitle(e.title)
    if (norm.length < 2) continue
    const country = (e.country ?? '').toLowerCase().trim()
    const year    = e.yearMade != null ? String(e.yearMade) : ''
    // Series: include season so Season 1 ≠ Season 2; movies get no season token
    const season  = e.type === 'series' ? String(e.seasonNumber ?? 1) : ''
    const key = `title:${norm}|${country}|${year}|${season}`
    const arr = byTitle.get(key) ?? []
    arr.push(e)
    byTitle.set(key, arr)
  }
  for (const [key, group] of Array.from(byTitle.entries())) {
    if (group.length > 1 && !ignoredDuplicateKeys.has(key)) {
      duplicates.push({ key, reason: 'title', entries: group })
    }
  }

  const totalCount =
    classification.length +
    duplicates.length +
    missingRuntime.length +
    missingCountry.length +
    missingPoster.length +
    missingRating.length +
    missingDateFinished.length +
    missingGenres.length +
    missingEpisodeProgress.length

  return {
    classification,
    duplicates,
    missingRuntime,
    missingCountry,
    missingPoster,
    missingRating,
    missingDateFinished,
    missingGenres,
    missingEpisodeProgress,
    totalCount,
  }
}
