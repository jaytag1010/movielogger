import { MediaEntry } from './media'
import { NormalizedTMDBResult } from './tmdb'

export interface ImportRow {
  [key: string]: string | number | null | undefined
}

export interface MappedRow {
  title?: string
  type?: string
  status?: string
  yearMade?: number | null
  totalEpisodes?: number | null
  episodeDurationMinutes?: number | null
  /** Numeric average duration from a dedicated spreadsheet column. Higher priority than range parsing. */
  episodeAverageDuration?: number | null
  watchHours?: number | null
  personalRating?: number | null
  ageRating?: string | null
  genres?: string[]
  country?: string | null
  dateFinished?: string | null
  specialNotes?: string | null
  tmdbId?: number | null
  /**
   * Preserved from the source Excel/CSV "ID" column.
   * Stored as legacyId on the created entry — never used as primary key.
   */
  legacyId?: string | null
  /**
   * Season number extracted from a dedicated column or parsed from the title
   * (e.g. "Attack on Titan Season 1" → seasonNumber=1, title="Attack on Titan").
   * null when not applicable (movies) or unknown.
   */
  seasonNumber?: number | null
  /**
   * Next episode to watch for series entries.
   * Exported as "Next Episode"; also maps to "current episode" etc.
   */
  nextEpisodeToWatch?: number | null
  /**
   * Poster image URL exported from a previous MovieLogger export.
   * Used as a fallback when TMDB is unreachable during re-import so that
   * art is never lost across export → clear → re-import cycles.
   */
  posterUrl?: string | null
  /**
   * Backdrop image URL exported from a previous MovieLogger export.
   * Fallback for the same reason as posterUrl.
   */
  backdropUrl?: string | null
}

export interface ImportValidationError {
  row: number
  field: string
  message: string
}

/** How a duplicate was detected. */
export type DuplicateType =
  | 'exact_tmdb'    // TMDB ID matched an existing entry
  | 'exact_title'   // Title matched exactly (case-insensitive)
  | 'legacy'        // Title + country + year + episode count all match
  | 'similar_title' // Normalised base title is similar (e.g. "The Office" variants)

/** TMDB search result attached during the preview enrichment step. */
export interface TMDBMatchResult {
  status: 'matched' | 'no_match'
  result: NormalizedTMDBResult | null
  /** Confidence score 0–1. Only relevant when status === 'matched'. */
  confidence: number
}

export interface ImportPreviewRow {
  rowIndex: number
  raw: ImportRow
  mapped: MappedRow
  errors: ImportValidationError[]
  /**
   * True only when the row is an unambiguous duplicate and will be auto-skipped:
   *   - TMDB ID matches an existing entry, OR
   *   - Title + Country + Year + Episode Count all match (legacy duplicate)
   */
  isDuplicate: boolean
  /**
   * True when the row needs human review before importing.
   * The user decides — the checkbox is pre-checked so it will import unless unchecked.
   *   - Exact title match (same name, different metadata possible)
   *   - Similar title (e.g. "The Office (US)" vs "The Office (UK)")
   */
  needsReview: boolean
  /** Human-readable reason explaining why this row needs review. */
  reviewReason: string | null
  duplicateType: DuplicateType | null
  /** Existing entry for auto-skip duplicates. */
  existingEntry?: MediaEntry
  /**
   * Existing entries whose normalised titles match (for similar-title review).
   * Only populated when duplicateType === 'similar_title'.
   */
  similarTitles: MediaEntry[]
  willImport: boolean
  /** TMDB enrichment result found during the preview step. */
  tmdbMatch: TMDBMatchResult
  /** True when ALL column values for this row are null/empty. Completely ignored — not counted as errors. */
  isEmptyRow: boolean
}

/** User edits made inside a review card. Merged on top of mapped data before TMDB overrides. */
export interface ReviewCardEdits {
  title?: string
  type?: 'movie' | 'series'
  status?: import('./media').MediaStatus
  yearMade?: number | null
  country?: string | null
  genres?: string[]
  ageRating?: string | null
  totalEpisodes?: number | null
  episodeDurationMinutes?: number | null
  watchHours?: number | null
  personalRating?: number | null
  specialNotes?: string | null
}

export interface ImportReportRow {
  rowIndex: number
  title: string
  result:
    | 'imported'            // clean import, no issues
    | 'imported_reviewed'   // imported after user review (title match / similar title)
    | 'skipped_duplicate'   // auto-skipped: TMDB ID match or legacy duplicate
    | 'skipped_error'       // skipped due to validation error
    | 'skipped_review'      // review card that user chose not to import
  reason: string
  tmdbMatch: string | null
}

export interface ImportReport {
  importedCount: number
  /** Entries auto-matched and imported via TMDB. */
  matchedImportedCount: number
  /** Entries auto-matched and imported via MDL (subset of total matched). */
  mdlMatchedCount: number
  similarFlaggedCount: number
  duplicatesImported: number
  duplicateCount: number
  failedCount: number
  ignoredEmptyRows: number
  rows: ImportReportRow[]
  timestamp: Date
}

export interface ImportResult {
  total: number
  imported: number
  skipped: number
  errors: number
  entries: MediaEntry[]
  failedRows: ImportPreviewRow[]
}

export const COLUMN_ALIASES: Record<string, string[]> = {
  title: [
    'title',
    'movie title',
    'title name',
    'name',
    'film title',
    'series title',
    'show title',
    'show name',
    'film',
    'movie',
  ],
  type: [
    'type',
    'media type',
    'content type',
    'kind',
    'category',
    'format',
  ],
  status: [
    'status',
    'watch status',
    'viewing status',
    'state',
  ],
  yearMade: [
    'year',
    'year made',
    'release year',
    'year released',
    'year of release',
    'production year',
    'made',
    'released',
  ],
  totalEpisodes: [
    'episodes',
    'episode',
    'total episodes',
    'total episode',
    'total eps',
    'episode count',
    'num episodes',
    'no of episodes',
    'number of episodes',
    'ep count',
    'eps',
    'episodes count',
  ],
  episodeDurationMinutes: [
    'episode duration',
    'duration',
    'runtime',
    'episode runtime',
    'ep duration',
    'minutes',
    'min',
    'episode length',
    'length',
  ],
  episodeAverageDuration: [
    'episode average duration',
    'episode avg duration',
    'average episode duration',
    'avg episode duration',
    'average duration',
    'avg duration',
    'avg runtime',
    'average runtime',
    'ep avg duration',
    'avg ep duration',
    'mean duration',
    'mean episode duration',
  ],
  watchHours: [
    'watch hours',
    'watch hour',
    'watched hours',
    'hours watched',
    'total hours',
    'total hour',
    'hours',
    'hour',
    'time watched',
    'viewing time',
    'watch time',
    'total watch time',
  ],
  personalRating: [
    'rating',
    'personal rating',
    'my rating',
    'score',
    'my score',
    'user rating',
  ],
  ageRating: [
    'age rating',
    'content rating',
    'maturity rating',
    'rated',
    'certification',
    'pg rating',
    'mpaa',
  ],
  genres: [
    'genre',
    'genres',
    'category',
    'categories',
    'tags',
    'type tags',
  ],
  country: [
    'country',
    'origin',
    'country of origin',
    'production country',
    'origin country',
    'nationality',
    'made in',
  ],
  dateFinished: [
    'date finished',
    'completed on',
    'finish date',
    'watched on',
    'date watched',
    'completed date',
    'finished',
    'date completed',
    'watch date',
  ],
  specialNotes: [
    'notes',
    'special notes',
    'comments',
    'remarks',
    'note',
    'review',
    'thoughts',
    'memo',
  ],
  tmdbId: [
    'tmdb id',
    'tmdb',
    'tmdb_id',
    'tmdbid',
    'the movie db id',
    'movie db id',
  ],
  /**
   * Any "ID" column from an existing spreadsheet is treated as legacyId.
   * MovieLogger always generates its own internalId (ML-XXXXXX).
   */
  legacyId: [
    'id',
    'id number',
    'internal id',
    'ml id',
    'movielogger id',
    'entry id',
    'legacy id',
    'old id',
    'source id',
  ],
  seasonNumber: [
    'season',
    'season number',
    'season num',
    'season no',
    'season #',
    's number',
    'series season',
    'season n',
  ],
  nextEpisodeToWatch: [
    'next episode',
    'next episode to watch',
    'episode progress',
    'current episode',
    'watching episode',
    'ep progress',
    'next ep',
  ],
  posterUrl: [
    'poster url',
    'poster',
    'poster link',
    'image url',
    'thumbnail url',
    'cover url',
    'cover image',
  ],
  backdropUrl: [
    'backdrop url',
    'backdrop',
    'backdrop link',
    'background url',
    'banner url',
  ],
}
