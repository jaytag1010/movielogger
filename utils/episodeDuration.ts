/**
 * parseEpisodeDurationRange
 *
 * Converts a spreadsheet episode-duration value into a numeric minute count.
 *
 * Supported inputs
 * ─────────────────
 *   Numeric values  →  returned as-is          (e.g. 25, 45.5)
 *   Known ranges    →  resolved to midpoint     (e.g. "21-30" → 25.5)
 *   "61 up" family  →  resolved to 90 minutes
 *   Unknown strings →  null
 *   null / undefined → null
 *
 * Range → midpoint table
 * ─────────────────────────
 *   1–10    →   5.5
 *   11–20   →  15.5
 *   21–30   →  25.5
 *   31–40   →  35.5
 *   41–50   →  45.5
 *   51–60   →  55.5
 *   61 up   →  90.0
 *
 * Reused by: import (columnMapper), buildEntryInput, export, TMDB refresh fallback.
 */

// Separator: hyphen, en-dash, or "to" (e.g. "21-30", "21–30", "21 to 30")
const SEP = '[-–]|\\s+to\\s+'

const DURATION_RANGES: Array<{ pattern: RegExp; minutes: number }> = [
  { pattern: new RegExp(`^1\\s*(?:${SEP})\\s*10$`, 'i'),  minutes: 5.5  },
  { pattern: new RegExp(`^11\\s*(?:${SEP})\\s*20$`, 'i'), minutes: 15.5 },
  { pattern: new RegExp(`^21\\s*(?:${SEP})\\s*30$`, 'i'), minutes: 25.5 },
  { pattern: new RegExp(`^31\\s*(?:${SEP})\\s*40$`, 'i'), minutes: 35.5 },
  { pattern: new RegExp(`^41\\s*(?:${SEP})\\s*50$`, 'i'), minutes: 45.5 },
  { pattern: new RegExp(`^51\\s*(?:${SEP})\\s*60$`, 'i'), minutes: 55.5 },
  // "61 up", "61+", "61 and above", "61 above", or bare "61-…"
  { pattern: /^61(\s*(up|above|\+|and\s*above))?$/i, minutes: 90 },
  { pattern: /^61\s*[-–]/i,                          minutes: 90 },
]

export function parseEpisodeDurationRange(
  value: string | number | null | undefined
): number | null {
  if (value === null || value === undefined || value === '') return null

  // Already numeric — pass straight through
  if (typeof value === 'number') return isNaN(value) ? null : value

  const str = String(value).trim()
  if (!str) return null

  // Try known range patterns first
  for (const { pattern, minutes } of DURATION_RANGES) {
    if (pattern.test(str)) return minutes
  }

  // Fall back to straight numeric parse (handles "25", "45.5", etc.)
  const n = parseFloat(str)
  return isNaN(n) ? null : n
}
