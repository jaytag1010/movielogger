/**
 * MyDramaList (MDL) API client — unofficial scraper proxy.
 *
 * Endpoint:  NEXT_PUBLIC_MDL_BASE_URL (e.g. https://my-drama-list-api-ten.vercel.app)
 *            No API key required for the current proxy.
 *
 * If the API later introduces authentication, add NEXT_PUBLIC_MDL_API_KEY to
 * .env.local and restore the `mdl-api-key` request header in mdlFetch — no
 * other changes are needed.
 *
 * Endpoints used:
 *   GET /api/search/q/{query}   → { results: MDLSearchItem[], total: number }
 *   GET /api/id/{slug}          → MDLDetailItem  (no wrapper object)
 *
 * Slug format: "{numericId}-{drama-name}"  e.g. "35729-emergency-lands-of-love"
 * The numeric prefix is extracted and stored as mdlId.
 *
 * Mirrors the architecture of lib/tmdb/api.ts.
 * If MDL_BASE_URL is not configured, all functions return empty arrays (graceful fallback).
 */

import { NormalizedTMDBResult } from '@/types/tmdb'

const MDL_BASE_URL   = process.env.NEXT_PUBLIC_MDL_BASE_URL
const MDL_API_KEY    = process.env.NEXT_PUBLIC_MDL_API_KEY  // optional — not currently required
const MDL_TIMEOUT_MS = 12_000  // slightly longer — proxy adds ~1 s scrape delay

// ── Raw response types from the proxy ─────────────────────────────────────

/** One item returned by /api/search/q/{query} */
interface MDLSearchItem {
  title: string
  slug: string          // e.g. "35729-emergency-lands-of-love"
  year: string          // e.g. "2019"
  image: string | null  // poster URL
  rating: string | null
  url: string
}

interface MDLSearchResponse {
  results: MDLSearchItem[]
  total: number
}

/** Full detail object returned by /api/id/{slug} */
interface MDLDetailItem {
  slug: string
  url: string
  title: string         // may include year: "Crash Landing on You (2019)"
  image: string | null
  synopsis: string | null
  country: string | null
  /** String episode count: "16", or absent for movies. */
  episodes: string | null
  /** e.g. "Dec 14, 2019 - Feb 16, 2020" */
  aired: string | null
  /** e.g. "1 hr. 25 min." or "25 min." */
  duration: string | null
  content_rating: string | null
  genres: string[]
  tags?: string[]
  rating: string | null
}

// ── Helpers ────────────────────────────────────────────────────────────────

function isMDLAvailable(): boolean {
  return !!MDL_BASE_URL
}

/** Extract the leading numeric ID from a slug like "35729-emergency-lands-of-love". */
function slugToId(slug: string): number {
  const match = slug.match(/^(\d+)/)
  return match ? parseInt(match[1], 10) : 0
}

/**
 * Strip a trailing year from a title that the detail endpoint appends.
 * "Crash Landing on You (2019)" → "Crash Landing on You"
 */
function stripYearSuffix(title: string): string {
  return title.replace(/\s*\(\d{4}\)\s*$/, '').trim()
}

/**
 * Parse a year out of MDL's aired string "Dec 14, 2019 - Feb 16, 2020"
 * or a bare "2019" string. Returns null if unparseable.
 */
function parseYear(aired: string | null): number | null {
  if (!aired) return null
  const match = aired.match(/\b(\d{4})\b/)
  return match ? parseInt(match[1], 10) : null
}

/**
 * Parse "1 hr. 25 min." → 85, "25 min." → 25, "1 hr." → 60.
 * Returns null if unparseable.
 */
function parseDuration(duration: string | null): number | null {
  if (!duration) return null
  let minutes = 0
  const hrMatch  = duration.match(/(\d+)\s*hr/)
  const minMatch = duration.match(/(\d+)\s*min/)
  if (hrMatch)  minutes += parseInt(hrMatch[1], 10) * 60
  if (minMatch) minutes += parseInt(minMatch[1], 10)
  return minutes > 0 ? minutes : null
}

/** Infer media type: if episodes > 1 → series, if episodes === 1 or absent → movie. */
function inferType(episodes: string | null): 'movie' | 'series' {
  if (!episodes) return 'movie'
  const n = parseInt(episodes, 10)
  return !isNaN(n) && n > 1 ? 'series' : 'movie'
}

async function mdlFetch<T>(path: string): Promise<T> {
  if (!MDL_BASE_URL) throw new Error('MDL base URL not configured')

  const url = `${MDL_BASE_URL}${path}`
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), MDL_TIMEOUT_MS)

  // Include API key only if one is configured
  const headers: Record<string, string> = { 'Content-Type': 'application/json' }
  if (MDL_API_KEY) headers['mdl-api-key'] = MDL_API_KEY

  try {
    const res = await fetch(url, { signal: controller.signal, headers })
    if (!res.ok) throw new Error(`MDL API error: ${res.status} ${res.statusText}`)
    return res.json() as Promise<T>
  } finally {
    clearTimeout(timer)
  }
}

/** Convert a search result item to our shared NormalizedTMDBResult shape. */
function normalizeSearchItem(item: MDLSearchItem): NormalizedTMDBResult {
  const mdlId = slugToId(item.slug)
  return {
    tmdbId: 0,           // MDL results carry no TMDB ID — callers use mdlId instead
    title: item.title,
    type: 'series',      // search results don't include type; assume series (most MDL content)
    year: parseYear(item.year),
    posterUrl: item.image ?? null,
    backdropUrl: null,
    genres: [],
    country: null,       // not in search results — populated on detail fetch
    runtime: null,
    totalEpisodes: null,
    ageRating: null,
    overview: '',
    source: 'mdl',
    mdlId,
    // Store slug so callers can fetch details if needed
    _mdlSlug: item.slug,
  }
}

/** Convert a detail response to our shared NormalizedTMDBResult shape. */
function normalizeDetail(item: MDLDetailItem): NormalizedTMDBResult {
  const mdlId = slugToId(item.slug)
  const episodeCount = item.episodes ? parseInt(item.episodes, 10) : null
  return {
    tmdbId: 0,
    title: stripYearSuffix(item.title),
    type: inferType(item.episodes),
    year: parseYear(item.aired),
    posterUrl: item.image ?? null,
    backdropUrl: null,
    genres: item.genres ?? [],
    country: item.country ?? null,
    runtime: parseDuration(item.duration),
    totalEpisodes: !isNaN(episodeCount!) ? episodeCount : null,
    ageRating: item.content_rating ?? null,
    overview: item.synopsis ?? '',
    source: 'mdl',
    mdlId,
    _mdlSlug: item.slug,
  }
}

// ── Public API ─────────────────────────────────────────────────────────────

/**
 * Search MDL for titles matching `query`.
 * Returns up to 10 normalized results.
 * Returns empty array if MDL_BASE_URL is not configured or the request fails — never throws.
 */
export async function searchMDL(query: string): Promise<NormalizedTMDBResult[]> {
  if (!isMDLAvailable()) return []
  try {
    const encoded = encodeURIComponent(query)
    const data = await mdlFetch<MDLSearchResponse>(`/api/search/q/${encoded}`)
    return (data.results ?? []).slice(0, 10).map(normalizeSearchItem)
  } catch {
    // Non-fatal — MDL unavailable, falls back to Excel
    return []
  }
}

/**
 * Fetch full details for a known MDL slug (e.g. "35729-emergency-lands-of-love").
 * Throws on failure — callers should catch.
 */
export async function fetchMDLDetails(slug: string): Promise<NormalizedTMDBResult> {
  const data = await mdlFetch<MDLDetailItem>(`/api/id/${encodeURIComponent(slug)}`)
  return normalizeDetail(data)
}
