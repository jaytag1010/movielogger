/**
 * Unified metadata provider abstraction.
 *
 * Authority order:  TMDB → MDL → Excel
 *
 * searchAllProviders()   — parallel TMDB + MDL search, combined results (for UI)
 * findMetadataMatch()    — sequential TMDB-first with MDL fallback (for import pipeline)
 *
 * Future providers can be added here without touching the rest of the app.
 */

import { NormalizedTMDBResult } from '@/types/tmdb'
import { MappedRow, TMDBMatchResult } from '@/types/import'
import { searchMultiNormalized } from '@/lib/tmdb/api'
import { searchMDL, fetchMDLDetails } from '@/lib/mdl/api'
import { normalizeCountry } from '@/utils/countries'

// ── Shared scoring logic ───────────────────────────────────────────────────

/**
 * Score a single metadata result against an import row.
 * Identical algorithm used by both TMDB and MDL to ensure fair comparison.
 */
export function scoreMetadataResult(
  r: NormalizedTMDBResult,
  mapped: MappedRow,
  rowCountryNorm: string | null
): number {
  let score = 0
  const rTitleNorm = r.title.toLowerCase().trim()
  const titleNorm  = (mapped.title ?? '').toLowerCase().trim()

  // ── Title similarity (primary signal, 0.60 max) ──────────────────────────
  if (rTitleNorm === titleNorm)                                          score += 0.60
  else if (rTitleNorm.includes(titleNorm) || titleNorm.includes(rTitleNorm)) score += 0.30

  // ── Year match (+0.20) ────────────────────────────────────────────────────
  if (mapped.yearMade && r.year && mapped.yearMade === r.year)           score += 0.20

  // ── Series structural signals (+0.15 each, overrides type-column bias) ───
  const rowHasEpisodes = (mapped.totalEpisodes ?? 0) > 1
  const rowHasSeason   = mapped.seasonNumber != null && mapped.seasonNumber >= 1
  if (r.type === 'series') {
    if (rowHasEpisodes) score += 0.15
    if (rowHasSeason)   score += 0.15
  } else {
    if (rowHasEpisodes) score -= 0.15
    if (rowHasSeason)   score -= 0.15
  }

  // ── Type column (+0.05) ───────────────────────────────────────────────────
  if (mapped.type && r.type === mapped.type) score += 0.05

  // ── Country match (+0.10) ─────────────────────────────────────────────────
  if (rowCountryNorm && r.country) {
    const rCountryNorm = normalizeCountry(r.country)?.toLowerCase() ?? r.country.toLowerCase()
    if (rowCountryNorm === rCountryNorm) score += 0.10
  }

  return score
}

// ── Unified search (for UI — parallel providers) ───────────────────────────

/**
 * Search TMDB and MDL in parallel, combining results into a single list.
 * TMDB results appear first (primary provider), MDL results appended after.
 * Deduplication: MDL results whose title + year match a TMDB result are removed.
 * Each result carries `source: 'tmdb' | 'mdl'`.
 * Graceful: if either provider errors, the other's results are still returned.
 */
export async function searchAllProviders(
  query: string
): Promise<NormalizedTMDBResult[]> {
  const [tmdbSettled, mdlSettled] = await Promise.allSettled([
    searchMultiNormalized(query),
    searchMDL(query),
  ])

  const tmdbResults: NormalizedTMDBResult[] =
    tmdbSettled.status === 'fulfilled' ? tmdbSettled.value : []
  const mdlResults: NormalizedTMDBResult[] =
    mdlSettled.status === 'fulfilled' ? mdlSettled.value : []

  // Tag TMDB results with source (searchMultiNormalized doesn't set it)
  const taggedTmdb = tmdbResults.map((r) => ({ ...r, source: 'tmdb' as const }))

  // Remove MDL results already covered by a TMDB result (same title + year)
  const dedupedMdl = mdlResults.filter((mdlR) =>
    !taggedTmdb.some((tmdbR) => {
      const sameTitle =
        tmdbR.title.toLowerCase().trim() === mdlR.title.toLowerCase().trim()
      const sameYear = !tmdbR.year || !mdlR.year || tmdbR.year === mdlR.year
      return sameTitle && sameYear
    })
  )

  return [...taggedTmdb, ...dedupedMdl]
}

// ── Import matching (sequential — TMDB first, then MDL) ────────────────────

/**
 * Find the best metadata match for an import row.
 *
 * Flow:
 *   1. Try TMDB → if confidence ≥ 0.55, return matched.
 *   2. Try MDL  → if confidence ≥ 0.55, return matched.
 *   3. Both below threshold → return no_match.
 *
 * Never throws — all provider failures are caught and treated as no_match.
 */
export async function findMetadataMatch(mapped: MappedRow): Promise<TMDBMatchResult> {
  if (!mapped.title) return { status: 'no_match', result: null, confidence: 0 }

  // Row already carries an explicit tmdbId — treat as a confident match.
  // Full metadata is fetched later in buildEntryInput; build a minimal result here.
  if (mapped.tmdbId) {
    const synthetic: NormalizedTMDBResult = {
      tmdbId: mapped.tmdbId,
      title:          mapped.title,
      type:           (mapped.type === 'series' ? 'series' : 'movie') as 'movie' | 'series',
      year:           mapped.yearMade ?? null,
      posterUrl:      mapped.posterUrl ?? null,
      backdropUrl:    mapped.backdropUrl ?? null,
      genres:         mapped.genres ?? [],
      country:        mapped.country ?? null,
      runtime:        mapped.episodeDurationMinutes ?? null,
      totalEpisodes:  mapped.totalEpisodes ?? null,
      ageRating:      mapped.ageRating ?? null,
      overview:       '',
      source:         'tmdb',
      mdlId:          null,
    }
    return { status: 'matched', result: synthetic, confidence: 1.0 }
  }

  const rowCountryNorm = normalizeCountry(mapped.country)?.toLowerCase() ?? null

  // ── Step 1: TMDB ──────────────────────────────────────────────────────────
  let tmdbBest: { result: NormalizedTMDBResult; score: number } | null = null
  try {
    const tmdbResults = await searchMultiNormalized(mapped.title)
    if (tmdbResults.length > 0) {
      const scored = tmdbResults
        .map((r) => ({
          result: { ...r, source: 'tmdb' as const },
          score: scoreMetadataResult(r, mapped, rowCountryNorm),
        }))
        .sort((a, b) => b.score - a.score)
      tmdbBest = scored[0]
    }
  } catch {
    // TMDB unavailable — proceed to MDL
  }

  if (tmdbBest && tmdbBest.score >= 0.55) {
    return {
      status: 'matched',
      result: tmdbBest.result,
      confidence: Math.min(tmdbBest.score, 1),
    }
  }

  // ── Step 2: MDL ───────────────────────────────────────────────────────────
  let mdlBest: { result: NormalizedTMDBResult; score: number } | null = null
  try {
    const mdlResults = await searchMDL(mapped.title)
    if (mdlResults.length > 0) {
      const scored = mdlResults
        .map((r) => ({
          result: r,
          score: scoreMetadataResult(r, mapped, rowCountryNorm),
        }))
        .sort((a, b) => b.score - a.score)
      mdlBest = scored[0]
    }
  } catch {
    // MDL unavailable — fall through to no_match
  }

  if (mdlBest && mdlBest.score >= 0.55) {
    // Enrich sparse search result with full detail (episodes, country, genres, etc.)
    let enrichedMdl = mdlBest.result
    const slug = mdlBest.result._mdlSlug
    if (slug) {
      try { enrichedMdl = await fetchMDLDetails(slug) } catch { /* keep sparse result */ }
    }
    return {
      status: 'matched',
      result: enrichedMdl,
      confidence: Math.min(mdlBest.score, 1),
    }
  }

  // Both providers below threshold
  const bestScore = Math.max(tmdbBest?.score ?? 0, mdlBest?.score ?? 0)
  return { status: 'no_match', result: null, confidence: bestScore }
}
