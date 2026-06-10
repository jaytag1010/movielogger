/**
 * ISO 3166-1 alpha-2 → full country name mapping.
 *
 * TMDB returns ISO codes for TV series (origin_country) and full names for
 * movies (production_countries[0].name). This mapping normalises both to
 * a consistent full-name form used everywhere in the app.
 *
 * Covers every country that appears in TMDB results; common Asian markets
 * relevant to this library are listed first for readability.
 */
export const ISO_TO_COUNTRY: Record<string, string> = {
  // ── Asia-Pacific ─────────────────────────────────────────────────────────
  PH: 'Philippines',
  TH: 'Thailand',
  JP: 'Japan',
  KR: 'South Korea',
  CN: 'China',
  TW: 'Taiwan',
  HK: 'Hong Kong',
  SG: 'Singapore',
  ID: 'Indonesia',
  MY: 'Malaysia',
  VN: 'Vietnam',
  MN: 'Mongolia',
  MM: 'Myanmar',
  KH: 'Cambodia',
  LA: 'Laos',
  BD: 'Bangladesh',
  LK: 'Sri Lanka',
  NP: 'Nepal',
  PK: 'Pakistan',
  IN: 'India',
  AU: 'Australia',
  NZ: 'New Zealand',
  BT: 'Bhutan',
  MV: 'Maldives',
  FJ: 'Fiji',
  PG: 'Papua New Guinea',
  BN: 'Brunei',
  TL: 'Timor-Leste',
  // ── Central & South Asia ─────────────────────────────────────────────────
  KZ: 'Kazakhstan',
  UZ: 'Uzbekistan',
  KG: 'Kyrgyzstan',
  TJ: 'Tajikistan',
  TM: 'Turkmenistan',
  AF: 'Afghanistan',
  // ── Americas ─────────────────────────────────────────────────────────────
  US: 'United States',
  CA: 'Canada',
  MX: 'Mexico',
  BR: 'Brazil',
  AR: 'Argentina',
  CO: 'Colombia',
  CL: 'Chile',
  PE: 'Peru',
  VE: 'Venezuela',
  UY: 'Uruguay',
  PY: 'Paraguay',
  BO: 'Bolivia',
  EC: 'Ecuador',
  GT: 'Guatemala',
  HN: 'Honduras',
  SV: 'El Salvador',
  NI: 'Nicaragua',
  CR: 'Costa Rica',
  PA: 'Panama',
  CU: 'Cuba',
  DO: 'Dominican Republic',
  HT: 'Haiti',
  JM: 'Jamaica',
  TT: 'Trinidad and Tobago',
  BB: 'Barbados',
  PR: 'Puerto Rico',
  // ── Western Europe ───────────────────────────────────────────────────────
  GB: 'United Kingdom',
  IE: 'Ireland',
  FR: 'France',
  DE: 'Germany',
  IT: 'Italy',
  ES: 'Spain',
  PT: 'Portugal',
  NL: 'Netherlands',
  BE: 'Belgium',
  CH: 'Switzerland',
  AT: 'Austria',
  SE: 'Sweden',
  NO: 'Norway',
  DK: 'Denmark',
  FI: 'Finland',
  IS: 'Iceland',
  LU: 'Luxembourg',
  MT: 'Malta',
  CY: 'Cyprus',
  // ── Central & Eastern Europe ─────────────────────────────────────────────
  PL: 'Poland',
  CZ: 'Czech Republic',
  SK: 'Slovakia',
  HU: 'Hungary',
  RO: 'Romania',
  BG: 'Bulgaria',
  HR: 'Croatia',
  SI: 'Slovenia',
  RS: 'Serbia',
  BA: 'Bosnia and Herzegovina',
  ME: 'Montenegro',
  MK: 'North Macedonia',
  AL: 'Albania',
  GR: 'Greece',
  TR: 'Turkey',
  RU: 'Russia',
  UA: 'Ukraine',
  BY: 'Belarus',
  MD: 'Moldova',
  LT: 'Lithuania',
  LV: 'Latvia',
  EE: 'Estonia',
  // ── Caucasus ─────────────────────────────────────────────────────────────
  GE: 'Georgia',
  AM: 'Armenia',
  AZ: 'Azerbaijan',
  // ── Middle East ──────────────────────────────────────────────────────────
  IL: 'Israel',
  SA: 'Saudi Arabia',
  AE: 'United Arab Emirates',
  IR: 'Iran',
  IQ: 'Iraq',
  JO: 'Jordan',
  LB: 'Lebanon',
  SY: 'Syria',
  KW: 'Kuwait',
  QA: 'Qatar',
  BH: 'Bahrain',
  OM: 'Oman',
  YE: 'Yemen',
  PS: 'Palestine',
  // ── Africa ───────────────────────────────────────────────────────────────
  ZA: 'South Africa',
  EG: 'Egypt',
  NG: 'Nigeria',
  KE: 'Kenya',
  MA: 'Morocco',
  TN: 'Tunisia',
  LY: 'Libya',
  DZ: 'Algeria',
  GH: 'Ghana',
  ET: 'Ethiopia',
  TZ: 'Tanzania',
  UG: 'Uganda',
  CI: 'Ivory Coast',
  SN: 'Senegal',
  CM: 'Cameroon',
  ZM: 'Zambia',
  ZW: 'Zimbabwe',
  MZ: 'Mozambique',
  RW: 'Rwanda',
  MG: 'Madagascar',
  AO: 'Angola',
  CD: 'DR Congo',
  CG: 'Republic of Congo',
  SD: 'Sudan',
  SO: 'Somalia',
  ML: 'Mali',
  BF: 'Burkina Faso',
  NE: 'Niger',
  TD: 'Chad',
  // ── Other ────────────────────────────────────────────────────────────────
  XC: 'Czechoslovakia',   // historical
  SU: 'Soviet Union',     // historical
  YU: 'Yugoslavia',       // historical
}

/**
 * Well-known aliases that can't be caught by the ISO-code regex alone.
 * Keyed by lower-cased alias; value is the canonical full name.
 */
const COUNTRY_NAME_ALIASES: Record<string, string> = {
  // United States variants
  'usa':                       'United States',
  'u.s.a.':                    'United States',
  'u.s.a':                     'United States',
  'united states of america':  'United States',
  'america':                   'United States',
  // United Kingdom variants
  'uk':                        'United Kingdom',
  'great britain':             'United Kingdom',
  'england':                   'United Kingdom',
  'britain':                   'United Kingdom',
  // South Korea variants
  'korea':                     'South Korea',
  // Common shorthand kept consistent
  'holland':                   'Netherlands',
  // Ireland
  'eire':                      'Ireland',
  'éire':                      'Ireland',
  // Others
  'uae':                       'United Arab Emirates',
  'drc':                       'DR Congo',
}

/**
 * Normalise a country value to a consistent full-name string.
 *
 * Handles:
 *   - 2-letter ISO codes returned by TMDB for TV series ("TH" → "Thailand")
 *   - Already-expanded names returned by TMDB for movies ("Thailand" → "Thailand")
 *   - Common aliases ("USA" → "United States", "UK" → "United Kingdom", …)
 *   - Null / undefined → null
 */
export function normalizeCountry(value: string | null | undefined): string | null {
  if (!value) return null
  const trimmed = value.trim()
  if (!trimmed) return null

  // Check well-known multi-form aliases first (before the ISO regex)
  const alias = COUNTRY_NAME_ALIASES[trimmed.toLowerCase()]
  if (alias) return alias

  // If it's a 2-letter ISO code (case-insensitive), expand it
  if (/^[A-Za-z]{2}$/.test(trimmed)) {
    return ISO_TO_COUNTRY[trimmed.toUpperCase()] ?? trimmed
  }

  // Already a full name — return as-is
  return trimmed
}

/**
 * Fallback top-8 countries shown when the library is empty.
 * Once the user has entries, CountrySelect replaces this with their
 * actual top-8 countries by title count.
 */
export const FEATURED_COUNTRIES = [
  'Philippines',
  'Thailand',
  'Japan',
  'South Korea',
  'United States',
  'United Kingdom',
  'China',
  'India',
]

/**
 * All countries in alphabetical order (full names), for the secondary section
 * of the country dropdown.
 */
export const ALL_COUNTRIES_SORTED = Object.values(ISO_TO_COUNTRY)
  .filter((v, i, arr) => arr.indexOf(v) === i) // deduplicate
  .sort((a, b) => a.localeCompare(b))
