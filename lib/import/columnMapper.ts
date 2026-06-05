import { COLUMN_ALIASES, ImportRow, MappedRow } from '@/types/import'
import { parseEpisodeDurationRange } from '@/utils/episodeDuration'

// ---------------------------------------------------------------------------
// Season extraction
// ---------------------------------------------------------------------------

/**
 * Try to parse a season number from a title string.
 *
 * Recognised patterns (case-insensitive, at the END of the title string):
 *   "Attack on Titan Season 1"   → baseName="Attack on Titan",  seasonNumber=1
 *   "Stranger Things S2"         → baseName="Stranger Things",  seasonNumber=2
 *   "Breaking Bad - Part 2"      → baseName="Breaking Bad",     seasonNumber=2
 *
 * Returns { baseName, seasonNumber: null } when no pattern matches.
 */
export function extractSeasonFromTitle(title: string): {
  baseName: string
  seasonNumber: number | null
} {
  if (!title) return { baseName: title, seasonNumber: null }
  const str = title.trim()

  // Pattern 1: "Season N" at the end (with optional separator)
  const seasonMatch = str.match(/^(.+?)[\s\-:]+[Ss]eason\s+(\d+)\s*$/i)
  if (seasonMatch) {
    const n = parseInt(seasonMatch[2], 10)
    if (n >= 1) return { baseName: seasonMatch[1].trim(), seasonNumber: n }
  }

  // Pattern 2: " S{N}" suffix — e.g. "Stranger Things S1"
  // Require N to be 1–99 to avoid false positives on acronyms
  const sNumMatch = str.match(/^(.+?)\s+[Ss](\d{1,2})\s*$/)
  if (sNumMatch) {
    const n = parseInt(sNumMatch[2], 10)
    if (n >= 1 && n <= 99) return { baseName: sNumMatch[1].trim(), seasonNumber: n }
  }

  // Pattern 3: "Part N" at the end (with optional separator)
  const partMatch = str.match(/^(.+?)[\s\-:]+[Pp]art\s+(\d+)\s*$/i)
  if (partMatch) {
    const n = parseInt(partMatch[2], 10)
    if (n >= 1) return { baseName: partMatch[1].trim(), seasonNumber: n }
  }

  return { baseName: str, seasonNumber: null }
}

function normalizeHeader(header: string): string {
  return header.toLowerCase().trim().replace(/[_\-\/]/g, ' ')
}

export function detectColumnMapping(headers: string[]): Record<string, string> {
  const mapping: Record<string, string> = {}

  for (const header of headers) {
    const normalized = normalizeHeader(header)
    for (const [field, aliases] of Object.entries(COLUMN_ALIASES)) {
      if (aliases.some((alias) => normalizeHeader(alias) === normalized)) {
        mapping[field] = header
        break
      }
    }
  }

  return mapping
}

function parseGenres(value: string | number | null | undefined): string[] {
  if (!value) return []
  const str = String(value).trim()
  if (!str) return []

  if (str.includes(',')) return str.split(',').map((g) => g.trim()).filter(Boolean)
  if (str.includes(';')) return str.split(';').map((g) => g.trim()).filter(Boolean)
  if (str.includes('|')) return str.split('|').map((g) => g.trim()).filter(Boolean)
  if (str.includes('/')) return str.split('/').map((g) => g.trim()).filter(Boolean)
  return [str]
}

function parseStatus(value: string | number | null | undefined): MappedRow['status'] {
  if (!value) return undefined
  const str = String(value).toLowerCase().trim()

  const statusMap: Record<string, MappedRow['status']> = {
    completed: 'completed',
    complete: 'completed',
    done: 'completed',
    finished: 'completed',
    watched: 'completed',
    watching: 'watching',
    'in progress': 'watching',
    inprogress: 'watching',
    current: 'watching',
    'currently watching': 'watching',
    planned: 'planned',
    plan: 'planned',
    'plan to watch': 'planned',
    'want to watch': 'planned',
    wishlist: 'planned',
    // Excel export variants — case-insensitive
    'not yet watched': 'planned',
    'not watched': 'planned',
    'unwatched': 'planned',
    "haven't watched": 'planned',
    'to watch': 'planned',
    dropped: 'dropped',
    drop: 'dropped',
    abandoned: 'dropped',
    dnf: 'dropped',
    'did not finish': 'dropped',
    'on hold': 'on_hold',
    onhold: 'on_hold',
    paused: 'on_hold',
    'on-hold': 'on_hold',
    hold: 'on_hold',
  }

  return statusMap[str] || 'planned'
}

function parseType(value: string | number | null | undefined): MappedRow['type'] {
  if (!value) return undefined
  const str = String(value).toLowerCase().trim()

  const typeMap: Record<string, MappedRow['type']> = {
    movie: 'movie',
    film: 'movie',
    movies: 'movie',
    series: 'series',
    show: 'series',
    'tv show': 'series',
    'tv series': 'series',
    television: 'series',
    anime: 'series',
    'anime series': 'series',
    documentary: 'movie',
    'mini series': 'series',
    miniseries: 'series',
    'tv mini series': 'series',
  }

  return typeMap[str] || undefined
}

function parseNumber(value: string | number | null | undefined): number | null {
  if (value === null || value === undefined || value === '') return null
  const n = Number(value)
  return isNaN(n) ? null : n
}

function parseDate(value: string | number | null | undefined): string | null {
  if (!value) return null
  const str = String(value).trim()
  if (!str) return null

  // Handle Excel serial date numbers
  if (typeof value === 'number' && value > 40000) {
    const excelEpoch = new Date(1900, 0, 1)
    const date = new Date(excelEpoch.getTime() + (value - 2) * 86400000)
    return date.toISOString().split('T')[0]
  }

  const datePatterns = [
    /^(\d{4})-(\d{2})-(\d{2})$/, // YYYY-MM-DD
    /^(\d{2})\/(\d{2})\/(\d{4})$/, // MM/DD/YYYY
    /^(\d{2})-(\d{2})-(\d{4})$/, // MM-DD-YYYY
    /^(\d{4})\/(\d{2})\/(\d{2})$/, // YYYY/MM/DD
  ]

  for (const pattern of datePatterns) {
    if (pattern.test(str)) {
      const date = new Date(str)
      if (!isNaN(date.getTime())) {
        return date.toISOString().split('T')[0]
      }
    }
  }

  const date = new Date(str)
  if (!isNaN(date.getTime())) {
    return date.toISOString().split('T')[0]
  }

  return null
}

export function mapRow(row: ImportRow, columnMapping: Record<string, string>): MappedRow {
  const get = (field: string): string | number | null | undefined => {
    const col = columnMapping[field]
    return col ? row[col] : undefined
  }

  // ── Title + season extraction ────────────────────────────────────────────
  // If there is an explicit "Season" column use its value directly.
  // Otherwise try to extract the season number from the title string itself
  // (e.g. "Attack on Titan Season 1" → title="Attack on Titan", seasonNumber=1).
  const rawTitle = get('title') != null ? String(get('title')).trim() : undefined

  let title: string | undefined = rawTitle
  let seasonNumber: number | null = parseNumber(get('seasonNumber')) as number | null

  if (rawTitle && (seasonNumber == null || seasonNumber === undefined)) {
    const extracted = extractSeasonFromTitle(rawTitle)
    if (extracted.seasonNumber != null) {
      title = extracted.baseName   // strip season suffix from stored title
      seasonNumber = extracted.seasonNumber
    }
  }

  return {
    title,
    type: parseType(get('type')),
    status: parseStatus(get('status')),
    yearMade: parseNumber(get('yearMade')),
    totalEpisodes: parseNumber(get('totalEpisodes')),
    episodeDurationMinutes: parseEpisodeDurationRange(get('episodeDurationMinutes')),
    watchHours: parseNumber(get('watchHours')),
    personalRating: parseNumber(get('personalRating')),
    ageRating: get('ageRating') != null ? String(get('ageRating')).trim() : null,
    genres: parseGenres(get('genres')),
    country: get('country') != null ? String(get('country')).trim() : null,
    dateFinished: parseDate(get('dateFinished')),
    specialNotes: get('specialNotes') != null ? String(get('specialNotes')).trim() : null,
    tmdbId: parseNumber(get('tmdbId')),
    // Spreadsheet "ID" columns become legacyId — never overwrite the system-generated internalId
    legacyId: get('legacyId') != null ? String(get('legacyId')).trim() : null,
    seasonNumber,
    nextEpisodeToWatch: parseNumber(get('nextEpisodeToWatch')) as number | null,
    // Exported poster/backdrop URLs — used as fallback when TMDB is unreachable
    posterUrl: get('posterUrl') != null ? String(get('posterUrl')).trim() || null : null,
    backdropUrl: get('backdropUrl') != null ? String(get('backdropUrl')).trim() || null : null,
  }
}
