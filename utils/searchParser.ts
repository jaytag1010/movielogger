/**
 * Advanced search query parser.
 *
 * Extracts optional country and year tokens from a free-text search query,
 * leaving the remainder as the title to send to TMDB.
 *
 * Examples:
 *   "Brothers Korea 2015"  → { title: "Brothers", country: "South Korea", year: 2015 }
 *   "Brothers 2015"        → { title: "Brothers", country: null,        year: 2015 }
 *   "Brothers Korea"       → { title: "Brothers", country: "South Korea", year: null }
 *   "Parasite"             → { title: "Parasite",  country: null,        year: null }
 *   "Breaking Bad"         → { title: "Breaking Bad", country: null,     year: null }
 */

export interface ParsedSearchQuery {
  /** Clean title to send to the TMDB API. */
  title: string
  /** Normalised full country name (e.g. "South Korea", "United States"). */
  country: string | null
  /** 4-digit release year. */
  year: number | null
}

/**
 * Map of recognised country aliases (lower-cased) → canonical full name.
 * Multi-word aliases are checked before single-word ones.
 */
const COUNTRY_ALIASES: Record<string, string> = {
  // Korea
  'korea':              'South Korea',
  'south korea':        'South Korea',
  'korean':             'South Korea',
  'kr':                 'South Korea',
  // Japan
  'japan':              'Japan',
  'japanese':           'Japan',
  'jp':                 'Japan',
  // China
  'china':              'China',
  'chinese':            'China',
  'cn':                 'China',
  // Taiwan
  'taiwan':             'Taiwan',
  'taiwanese':          'Taiwan',
  'tw':                 'Taiwan',
  // Hong Kong
  'hong kong':          'Hong Kong',
  'hk':                 'Hong Kong',
  // Thailand
  'thailand':           'Thailand',
  'thai':               'Thailand',
  'th':                 'Thailand',
  // Philippines
  'philippines':        'Philippines',
  'filipino':           'Philippines',
  'pilipinas':          'Philippines',
  'ph':                 'Philippines',
  // Singapore
  'singapore':          'Singapore',
  'sg':                 'Singapore',
  // Indonesia
  'indonesia':          'Indonesia',
  'indonesian':         'Indonesia',
  'id':                 'Indonesia',
  // Malaysia
  'malaysia':           'Malaysia',
  'malaysian':          'Malaysia',
  'my':                 'Malaysia',
  // India
  'india':              'India',
  'indian':             'India',
  'in':                 'India',
  // Vietnam
  'vietnam':            'Vietnam',
  'vietnamese':         'Vietnam',
  'vn':                 'Vietnam',
  // United States
  'usa':                'United States',
  'u.s.a.':             'United States',
  'u.s.a':              'United States',
  'united states':      'United States',
  'united states of america': 'United States',
  'america':            'United States',
  'american':           'United States',
  'us':                 'United States',
  // United Kingdom
  'uk':                 'United Kingdom',
  'united kingdom':     'United Kingdom',
  'great britain':      'United Kingdom',
  'britain':            'United Kingdom',
  'british':            'United Kingdom',
  'england':            'United Kingdom',
  'gb':                 'United Kingdom',
  // France
  'france':             'France',
  'french':             'France',
  'fr':                 'France',
  // Germany
  'germany':            'Germany',
  'german':             'Germany',
  'de':                 'Germany',
  // Spain
  'spain':              'Spain',
  'spanish':            'Spain',
  'es':                 'Spain',
  // Italy
  'italy':              'Italy',
  'italian':            'Italy',
  'it':                 'Italy',
  // Canada
  'canada':             'Canada',
  'canadian':           'Canada',
  'ca':                 'Canada',
  // Australia
  'australia':          'Australia',
  'australian':         'Australia',
  'au':                 'Australia',
}

/**
 * Parse a raw search string into title + optional country + optional year.
 *
 * Rules:
 * - A token that is a 4-digit number between 1888–2100 is treated as a year.
 * - Recognised country names / abbreviations are stripped from the title.
 * - The remaining tokens form the title.
 * - If extraction would leave the title empty, no extraction occurs and the
 *   raw string is returned as the title (backward-compatible fallback).
 */
export function parseSearchQuery(raw: string): ParsedSearchQuery {
  const tokens = raw.trim().split(/\s+/)
  if (tokens.length === 0) return { title: '', country: null, year: null }

  // Track which token indices have been "consumed" by year/country detection
  const consumed = new Array<boolean>(tokens.length).fill(false)

  let year: number | null = null
  let country: string | null = null

  // ── Year detection ────────────────────────────────────────────────────────
  for (let i = 0; i < tokens.length; i++) {
    if (/^\d{4}$/.test(tokens[i])) {
      const n = parseInt(tokens[i], 10)
      if (n >= 1888 && n <= 2100) {
        year = n
        consumed[i] = true
        break // only one year expected
      }
    }
  }

  // ── Country detection: try two-word aliases first ─────────────────────────
  for (let i = 0; i < tokens.length - 1; i++) {
    if (consumed[i] || consumed[i + 1]) continue
    const twoWord = `${tokens[i]} ${tokens[i + 1]}`.toLowerCase()
    if (COUNTRY_ALIASES[twoWord]) {
      country = COUNTRY_ALIASES[twoWord]
      consumed[i] = true
      consumed[i + 1] = true
      break
    }
  }

  // ── Country detection: single-word aliases ────────────────────────────────
  if (!country) {
    for (let i = 0; i < tokens.length; i++) {
      if (consumed[i]) continue
      const lower = tokens[i].toLowerCase()
      if (COUNTRY_ALIASES[lower]) {
        country = COUNTRY_ALIASES[lower]
        consumed[i] = true
        break
      }
    }
  }

  // ── Build title from remaining tokens ─────────────────────────────────────
  const titleTokens = tokens.filter((_, i) => !consumed[i])

  // Safety: if extraction left no title, revert entirely (backward-compatible)
  if (titleTokens.length === 0) {
    return { title: raw.trim(), country: null, year: null }
  }

  return { title: titleTokens.join(' '), country, year }
}
