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
  return !entry.posterUrl || entry.posterUrl.trim() === ''
}

/** Only completed titles with no personal rating. */
export function hasMissingRating(entry: MediaEntry): boolean {
  return entry.status === 'completed' && entry.personalRating == null
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

  // 2. Extremely similar titles (not already captured by a TMDB-id group)
  const byTitle = new Map<string, MediaEntry[]>()
  for (const e of entries) {
    if (e.id && seenInTmdbGroup.has(e.id)) continue
    const norm = normaliseTitle(e.title)
    if (norm.length < 2) continue
    const arr = byTitle.get(norm) ?? []
    arr.push(e)
    byTitle.set(norm, arr)
  }
  for (const [norm, group] of Array.from(byTitle.entries())) {
    const key = `title:${norm}`
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
    missingRating.length

  return {
    classification,
    duplicates,
    missingRuntime,
    missingCountry,
    missingPoster,
    missingRating,
    totalCount,
  }
}
