# MovieLogger — Import Workflow Redesign
## Complete Implementation Handoff Document

**Date:** 2026-06-02  
**Status:** Ready to implement — audit complete, no code written yet  
**Scope:** Full redesign of the bulk import flow (Excel / CSV)

---

## 0. Project Context

**Stack:** Next.js 14 App Router, TypeScript strict, TailwindCSS, shadcn/ui (Radix), Framer Motion, Firebase Firestore, Zustand  
**Root path:** `C:\Users\Jayson\CLAUDE\movielogger`  
**Auth:** Firebase Authentication — all Firestore writes require `userId`  
**State:** Zustand `useMediaStore` holds client-side entries array  
**Entry type:** `MediaEntry` defined in `types/media.ts`

---

## 1. Every Existing File Involved in Import

| File | Role | Touch? |
|---|---|---|
| `app/(protected)/import/page.tsx` | Step state machine, orchestrates all phases | **FULL REWRITE** |
| `lib/import/parser.ts` | Row parsing, TMDB search, duplicate detection, preview building | **MODIFY** |
| `lib/import/columnMapper.ts` | Header detection, `mapRow()`, `extractSeasonFromTitle()` | **NO CHANGE** |
| `types/import.ts` | All import TypeScript types, `COLUMN_ALIASES` | **MODIFY** |
| `components/import/ImportDropzone.tsx` | File upload, drag-and-drop | **NO CHANGE** |
| `components/import/DryRunSummary.tsx` | Old post-parse stats screen | **DELETE / REPLACE** |
| `components/import/ImportPreview.tsx` | Old flat checkbox list | **DELETE / REPLACE** |
| `components/import/ImportReport.tsx` | Post-import results screen | **MODIFY** |
| `lib/firebase/firestore.ts` | `batchCreateMediaEntries()` — batch Firestore writes | **NO CHANGE** |
| `lib/tmdb/api.ts` | `searchMultiNormalized()`, `fetchMovieMetadata()`, etc. | **NO CHANGE** |
| `hooks/useTMDB.ts` | `useTMDBSearch` hook | **NO CHANGE** |
| `components/media/TMDBSearch.tsx` | TMDB search input component (reuse inside review cards) | **NO CHANGE** |
| `utils/formatters.ts` | `getDisplayTitle()`, `getEffectiveMediaType()` | **NO CHANGE** |
| `utils/countries.ts` | `normalizeCountry()` | **NO CHANGE** |

### New Files to Create

| File | Purpose |
|---|---|
| `components/import/ImportSummary.tsx` | Step 3 — "Import Summary" counts screen |
| `components/import/MatchedTitlesView.tsx` | Step 4 — poster grid of TMDB-matched entries |
| `components/import/ManualReviewView.tsx` | Step 5 — review queue with cards, remaining counter, bulk actions |
| `components/import/ReviewCard.tsx` | Individual review card — inline editing + TMDB search |
| `components/import/DuplicatesView.tsx` | Step 6 — separate duplicates screen |

---

## 2. Current Flow vs. New Flow

### Current (6 steps)
```
upload → parsing → dryrun → preview (flat checkbox list) → importing → report
```

### New (9 steps)
```
upload → parsing → summary → matched → review → duplicates → importing → report
```

The `preview` and `dryrun` steps are replaced by `summary`, `matched`, `review`, and `duplicates`.

---

## 3. Existing Type Definitions (what exists today)

### `ImportPreviewRow` (current)
```typescript
interface ImportPreviewRow {
  rowIndex: number
  raw: ImportRow
  mapped: MappedRow
  errors: ImportValidationError[]
  isDuplicate: boolean          // auto-skip: exact_tmdb or legacy
  needsReview: boolean          // review: exact_title or similar_title
  reviewReason: string | null
  duplicateType: DuplicateType | null
  existingEntry?: MediaEntry
  similarTitles: MediaEntry[]
  willImport: boolean
  tmdbMatch: TMDBMatchResult    // { status: 'matched'|'no_match', result, confidence }
}
```

### `ImportReport` (current)
```typescript
interface ImportReport {
  importedCount: number
  duplicateCount: number
  similarFlaggedCount: number
  failedCount: number
  rows: ImportReportRow[]
  timestamp: Date
}
```

### `TMDBMatchResult` (current)
```typescript
interface TMDBMatchResult {
  status: 'matched' | 'no_match'
  result: NormalizedTMDBResult | null
  confidence: number             // 0–1
}
```

---

## 4. Required Type Changes

### Add to `ImportPreviewRow`
```typescript
/**
 * True when ALL column values for this row are null/empty/whitespace.
 * These rows are completely ignored — not counted as errors, not processed.
 */
isEmptyRow: boolean
```

### Add to `ImportReport`
```typescript
/**
 * Count of rows that were completely empty (all columns null/empty).
 * Tracked separately from failedCount — does NOT affect success rates.
 */
ignoredEmptyRows: number
```

---

## 5. Empty Row Detection

### Where to implement
`lib/import/parser.ts` — inside `buildImportPreview()`, BEFORE `mapRow()` is called.

### Detection logic
```typescript
function isRowCompletelyEmpty(row: ImportRow): boolean {
  return Object.values(row).every(
    (v) => v === null || v === undefined || String(v).trim() === ''
  )
}
```

### Behavior
- If `isRowCompletelyEmpty(row)` → push a minimal `ImportPreviewRow` with `isEmptyRow: true`, skip ALL other processing (no mapRow, no validate, no TMDB, no duplicate check)
- Do NOT add to `errors`, NOT to `isDuplicate`, NOT to `needsReview`
- Track count: `ignoredCount` returned alongside the preview array
- These rows DO NOT appear in any UI section except the final count in the Import Report

### Parser return type change
`buildImportPreview()` currently returns `Promise<ImportPreviewRow[]>`. Change to:
```typescript
Promise<{ rows: ImportPreviewRow[]; ignoredEmptyRows: number }>
```

Update the call site in `import/page.tsx` accordingly.

### Note on CSV vs Excel
- CSV: `Papa.parse` with `skipEmptyLines: true` already skips completely empty lines — but may still emit rows with all-null values if columns exist but are empty. The `isRowCompletelyEmpty` check handles both.
- Excel: `XLSX.utils.sheet_to_json` with `defval: null` emits rows for every row in the sheet range, including empty ones. The check is essential here.

---

## 6. New Category Definitions

After `buildImportPreview` runs, rows fall into exactly one of these five categories:

| Category | Condition | Import behavior |
|---|---|---|
| **Ignored Empty** | `isEmptyRow === true` | Never shown, never imported |
| **Invalid** | `errors.length > 0` AND `!isEmptyRow` | Never imported, shown in report |
| **Duplicate** | `isDuplicate === true` AND `errors.length === 0` | Shown on Duplicates screen, user decides |
| **TMDB Matched** | `tmdbMatch.status === 'matched'` AND `errors.length === 0` AND `!isDuplicate` | Shown on Matched screen, bulk-import |
| **Manual Review** | everything else (no match, no error, no duplicate) INCLUDING `needsReview === true` rows | Shown on Review screen, per-card import |

**Important:** `needsReview` rows (exact_title, similar_title) that ALSO have a TMDB match → go to **TMDB Matched**, not Manual Review. The TMDB match takes precedence for categorization. The `reviewReason` is still shown on their card IF they end up in Review.

**Important:** Rows with `tmdbMatch.status === 'no_match'` that have no errors and are not duplicates → go to **Manual Review** even if `needsReview === false`. This is the biggest change from the current flow where those rows went to "Ready to import".

---

## 7. New Step Machine

### Step type
```typescript
type ImportStep = 
  | 'upload'        // File dropzone
  | 'parsing'       // Progress bar while TMDB matching runs
  | 'summary'       // "Import Summary" — counts, Cancel / Continue
  | 'matched'       // TMDB Matched poster grid — Back / Add All N Titles
  | 'review'        // Manual Review queue — per-card editing
  | 'duplicates'    // Duplicates — Skip All / Import Anyway
  | 'importing'     // Spinner while Firestore writes
  | 'report'        // Final import report
```

### Step transitions
```
upload ──[file dropped]──────────────→ parsing
parsing ──[preview built]────────────→ summary
summary ──[Cancel]──────────────────→ upload (reset)
summary ──[Continue]────────────────→ matched (if matchedRows.length > 0)
                                     → review (if matchedRows.length === 0 but reviewRows.length > 0)
                                     → duplicates (if only duplicates remain)
                                     → importing (if nothing to review)
matched ──[Back]────────────────────→ summary
matched ──[Add All N Titles]─────────→ imports matched rows → review (if reviewRows > 0)
                                                             → duplicates (if no review rows)
                                                             → importing (if nothing else)
review ──[Don't Add Remaining N]────→ duplicates (if duplicateRows > 0)
                                     → importing (to write already-added cards)
                                     → report (if nothing was imported at all)
review ──[Add Remaining N to List]──→ duplicates (if duplicateRows > 0)
                                     → importing
duplicates ──[Skip All]─────────────→ importing (or report if nothing to import)
duplicates ──[Import Anyway]─────────→ adds duplicates to import queue → importing
importing ──[complete]──────────────→ report
```

### State held in `import/page.tsx`
```typescript
const [step, setStep] = useState<ImportStep>('upload')
const [parseProgress, setParseProgress] = useState(0)

// Raw preview results from buildImportPreview
const [allRows, setAllRows] = useState<ImportPreviewRow[]>([])
const [ignoredEmptyRows, setIgnoredEmptyRows] = useState(0)

// Derived category arrays (computed once from allRows, never mutated)
const [matchedRows, setMatchedRows] = useState<ImportPreviewRow[]>([])
const [reviewRows, setReviewRows] = useState<ImportPreviewRow[]>([])
const [duplicateRows, setDuplicateRows] = useState<ImportPreviewRow[]>([])
const [errorRows, setErrorRows] = useState<ImportPreviewRow[]>([])

// Review queue: starts as reviewRows, shrinks as user adds cards individually
const [reviewQueue, setReviewQueue] = useState<ImportPreviewRow[]>([])

// Edits made inside review cards: keyed by rowIndex
const [reviewEdits, setReviewEdits] = useState<Record<number, ReviewCardEdits>>({})

// TMDB links made inside review cards: keyed by rowIndex
const [reviewTmdbLinks, setReviewTmdbLinks] = useState<Record<number, NormalizedTMDBResult>>({})

// Accumulates entries imported so far (matched + individually added review cards)
const [pendingImports, setPendingImports] = useState<Omit<MediaEntryInput, 'userId'>[]>([])

// For duplicates: track user's decision
const [importDuplicates, setImportDuplicates] = useState(false)

// Final report
const [importReport, setImportReport] = useState<ImportReport | null>(null)
```

---

## 8. Import Summary Screen (Step: `summary`)

**Component:** `components/import/ImportSummary.tsx`

### UI layout
```
Import Summary

Total Rows Read: 657

✓ TMDB Matched:              601   (emerald)
⚠ Manual Review Recommended:  52   (amber)
↺ Duplicates:                   3   (gray)
✕ Invalid Rows:                 1   (red)

Ignored Empty Rows:             7   (muted, below separator)

[Cancel]    [Continue →]
```

### Props
```typescript
interface ImportSummaryProps {
  matchedCount: number
  reviewCount: number
  duplicateCount: number
  errorCount: number
  ignoredEmptyRows: number
  totalRowsRead: number        // allRows.length + ignoredEmptyRows
  onContinue: () => void
  onCancel: () => void
}
```

### Behavior
- "Total Rows Read" = `allRows.length + ignoredEmptyRows` (includes empty rows in raw count)
- "Ignored Empty Rows" appears below a visual separator, dimmer color — it's informational
- [Cancel] → resets to `'upload'` step
- [Continue] → navigates to the correct next step (see step transitions above)
- Continue is disabled if `matchedCount + reviewCount + duplicateCount === 0` (nothing to import)

---

## 9. TMDB Matched Screen (Step: `matched`)

**Component:** `components/import/MatchedTitlesView.tsx`

### UI layout
```
TMDB Matched (601)

These titles were confidently matched. Review below, then add all.

[poster grid / list of matched entries]

Each entry shows:
  - Poster image (or Film/Tv placeholder)
  - Title (from TMDB result, not spreadsheet)
  - Year
  - Type badge: purple "Movie" or blue "Series"
  - Confidence: shown as a subtle percentage OR not shown (keep it simple)

[← Back]    [Add All 601 Titles]
```

### Props
```typescript
interface MatchedTitlesViewProps {
  rows: ImportPreviewRow[]           // matchedRows
  onBack: () => void
  onAddAll: () => Promise<void>      // triggers the import
  loading?: boolean
}
```

### Behavior
- **Scrollable list** (not a grid) — mobile-friendly, shows poster + title + year + type badge
- No checkboxes — user either adds all or goes back
- "Add All 601 Titles" button triggers `handleImportMatched()` in the page, which calls `buildEntryInput()` for each matched row and adds them to `pendingImports`
- After Add All completes, navigate to next step (review, duplicates, or importing)
- Loading spinner on the button while importing

### Poster display
- Use `row.tmdbMatch.result?.posterUrl` — the search result poster (low-res thumbnail, no full metadata fetch needed at this stage)
- Full metadata IS fetched during `buildEntryInput()` at actual import time (same as current)
- If no poster: Film icon for movies, Tv icon for series

---

## 10. Manual Review Screen (Step: `review`)

**Component:** `components/import/ManualReviewView.tsx`

### UI layout
```
Manual Review Recommended

Remaining: 52                    ← updates as user imports individual cards

[list of ReviewCards]

─────────────────────────────
[Don't Add Remaining 52]    [Add Remaining 52 to List]
```

### Props
```typescript
interface ManualReviewViewProps {
  queue: ImportPreviewRow[]           // reviewQueue — shrinks as cards are added
  edits: Record<number, ReviewCardEdits>
  tmdbLinks: Record<number, NormalizedTMDBResult>
  onSaveEdits: (rowIndex: number, edits: ReviewCardEdits) => void
  onLinkTMDB: (rowIndex: number, result: NormalizedTMDBResult) => void
  onAddOne: (rowIndex: number) => Promise<void>    // import single card, remove from queue
  onAddRemaining: () => void          // import all remaining queue items
  onSkipRemaining: () => void         // skip all remaining, go to next step
  loading?: boolean                   // true while an individual card is importing
  loadingRowIndex?: number | null     // which card is currently saving
}
```

### Remaining counter
- "Remaining: N" = `queue.length`
- Updates in real-time as user calls `onAddOne`
- Bottom buttons always show current count: "Don't Add Remaining N" / "Add Remaining N to List"

### Scroll behavior
- Cards in a scrollable list
- Bottom action bar is sticky / always visible

---

## 11. Review Card (Component: `ReviewCard.tsx`)

### States
Each card can be in one of these visual states:
1. **Collapsed** — shows title, reason, [Search TMDB] and [Edit] buttons
2. **Editing** — shows inline form fields + optional TMDB search bar
3. **TMDB Linked** — shows TMDB poster + "TMDB Linked" badge, fields pre-populated

### Collapsed state
```
┌────────────────────────────────────────────────┐
│ Unexpectedly Naughty Fukami                     │
│ ⚠ No confident TMDB match found                │
│                     [Search TMDB]  [Edit]  [+]  │
└────────────────────────────────────────────────┘
```
- `[+]` is a quick "Add to List" button that imports using current data (no edits needed)
- `[Edit]` expands the card to the editing state
- `[Search TMDB]` expands the card and focuses the TMDB search bar

### Editing state (expanded)
```
┌────────────────────────────────────────────────┐
│ TMDB Search (optional)                          │
│ [search input ............................  ]    │
│ [results dropdown if query >= 2 chars]          │
│ ─────────────────────────────────────────────  │
│ Title:          [Unexpectedly Naughty Fukami ]  │
│ Status:         [Completed ▼]                   │
│ Type:           [Series ▼]                      │
│ Year:           [2026    ]                      │
│ Country:        [Thailand ▼] ← CountrySelect   │
│ Genres:         [Drama, Comedy]                 │
│ Age Rating:     [TV-14  ]                       │
│ Total Episodes: [10     ]                       │
│ Ep Duration:    [45     ] min                   │
│ Watch Hours:    [7.50   ]                       │
│ Personal Rating:[8.25   ]                       │
│ Notes:          [textarea]                      │
│                                                 │
│ [Cancel]  [Save]  [Add to List]                 │
└────────────────────────────────────────────────┘
```

### ReviewCardEdits type
```typescript
interface ReviewCardEdits {
  title?: string
  type?: 'movie' | 'series'
  status?: MediaStatus
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
```

### Button behavior inside expanded card

**[Cancel]** — collapses card, discards any unsaved edits (edits in state are NOT saved)

**[Save]** — saves current form state to `reviewEdits[rowIndex]`, collapses card, card stays in queue.  
Purpose: allow editing multiple cards before deciding.  
Does NOT import.

**[Add to List]** — saves current form state to `reviewEdits[rowIndex]`, calls `onAddOne(rowIndex)`, removes card from queue, collapses.  
Purpose: import this one card immediately.

**[+] (collapsed quick-add)** — calls `onAddOne(rowIndex)` with no edits, removes card from queue.

### TMDB Search inside card
- Uses the existing `TMDBSearch` component (`components/media/TMDBSearch.tsx`)
- `mediaType="all"` — searches both movies and TV
- When user selects a result:
  1. Call `onLinkTMDB(rowIndex, result)`
  2. Auto-populate form fields from TMDB result (see Section 12)
  3. Show "TMDB Linked ✓" badge
  4. The TMDB search bar remains visible but collapses results

---

## 12. TMDB Linking Inside Review Cards

When user selects a TMDB result inside a review card, auto-populate these fields:

| Field | Source | Note |
|---|---|---|
| `tmdbId` | `result.tmdbId` | Stored for future metadata refresh |
| `type` | `result.type` | `'movie'` or `'series'` |
| `yearMade` | `result.year` | Only if result.year is not null |
| `country` | `result.country` | Only if result.country is not null |
| `genres` | Requires full fetch | See note below |
| `ageRating` | Requires full fetch | See note below |
| `totalEpisodes` | Requires full fetch | See note below |
| `episodeDurationMinutes` | Requires full fetch | See note below |
| `posterUrl` | `result.posterUrl` | Stored on the ReviewCardEdits for display |
| `backdropUrl` | `result.backdropUrl` | Stored on the ReviewCardEdits |

**Note on full fetch:** The `NormalizedTMDBResult` from search results is sparse (no genres, no age rating, no episode count). For card display purposes, use the search result immediately. The full metadata fetch (`fetchMovieMetadata` / `fetchTVMetadata`) happens inside `buildEntryInput()` during the actual import — same as the matched rows flow.

**Practical implementation:** When user selects a TMDB result in a review card, store the `NormalizedTMDBResult` in `reviewTmdbLinks[rowIndex]`. During `buildEntryInput()`, if `reviewTmdbLinks[rowIndex]` exists, treat it as a pre-resolved TMDB match (override `row.tmdbMatch`).

**"TMDB Linked" badge** — shown in the card header after linking. Color: blue. Content: "TMDB Linked ✓".

---

## 13. How `buildEntryInput()` Uses Review Card State

When `buildEntryInput(row)` is called for a review card, the function needs access to:
1. `reviewEdits[row.rowIndex]` — user-edited field overrides
2. `reviewTmdbLinks[row.rowIndex]` — TMDB result if user searched manually

Merge order for a review card entry:
```
Base:         row.mapped                          (from spreadsheet)
Override 1:   reviewEdits[row.rowIndex]           (user edits)
Override 2:   TMDB metadata fetched from reviewTmdbLinks[row.rowIndex] OR row.tmdbMatch.result
              (TMDB is authoritative for: type, poster, backdrop, country, ageRating, genres, yearMade)
User-owned:   personalRating, dateFinished, specialNotes, status  (never overwritten by TMDB)
```

Pass edits and links into `buildEntryInput` as optional parameters:
```typescript
async function buildEntryInput(
  row: ImportPreviewRow,
  edits?: ReviewCardEdits,
  tmdbLink?: NormalizedTMDBResult
): Promise<{ input: Omit<MediaEntryInput, 'userId'>; tmdbTitle: string | null }>
```

---

## 14. "Add All" vs "Add Remaining" vs Individual Add

### "Add All N Titles" (Matched screen)
- Calls `buildEntryInput(row)` for each matched row
- Adds results to `pendingImports`
- Does NOT write to Firestore yet
- Navigates to next step

### Individual "Add to List" (Review card)
- Merges `reviewEdits[rowIndex]` and `reviewTmdbLinks[rowIndex]` into the entry
- Calls `buildEntryInput(row, edits, tmdbLink)`
- Adds result to `pendingImports`
- Removes row from `reviewQueue`
- Counter decrements: "Remaining: 51"

### "Add Remaining N to List" (Review screen bottom)
- Imports ALL remaining `reviewQueue` entries
- Uses `reviewEdits[rowIndex]` if exists, otherwise uses `row.mapped` as-is
- Uses `reviewTmdbLinks[rowIndex]` if exists
- Does NOT require cards to have been opened/edited
- Adds all to `pendingImports`
- Navigates to Duplicates screen (or importing)

### "Don't Add Remaining N" (Review screen bottom)
- Skips all remaining queue entries (they are NOT added to `pendingImports`)
- Navigates to Duplicates screen (or importing)

### Critical rule (spec requirement):
> "Add Remaining X to List must import ALL remaining entries regardless of whether card was opened, edited, or reviewed. The decision belongs entirely to the user."

---

## 15. Duplicates Screen (Step: `duplicates`)

**Component:** `components/import/DuplicatesView.tsx`

### UI layout
```
Duplicates (3)

These titles already exist in your library.

┌─────────────────────────────────────────────┐
│ 📺 Love Reset                               │
│ Already exists in your library              │
│ Duplicate type: TMDB ID match               │
├─────────────────────────────────────────────┤
│ 🎬 My Romance Scammer                       │
│ Already exists in your library              │
│ Duplicate type: Title + metadata match      │
└─────────────────────────────────────────────┘

[Skip All Duplicates]    [Import Anyway]
```

### Props
```typescript
interface DuplicatesViewProps {
  rows: ImportPreviewRow[]            // duplicateRows
  onSkipAll: () => void
  onImportAll: () => void
}
```

### Behavior
- [Skip All Duplicates] → do NOT add duplicates to `pendingImports`, navigate to `'importing'`
- [Import Anyway] → add ALL duplicates to `pendingImports`, navigate to `'importing'`
- No per-row selection — all or nothing
- Duplicate type is shown: "TMDB ID match" for `exact_tmdb`, "Title + metadata match" for `legacy`

### Note on "Skip All" when nothing was imported
If `pendingImports` is empty AND user skips all duplicates, jump directly to `'report'` with a zeroes report.

---

## 16. Importing Step

No change to the spinner UI. The Firestore write is:
```typescript
const importedCount = await batchCreateMediaEntries(user.uid, pendingImports.map(i => i))
```

`pendingImports` accumulates from:
- Matched rows (added when user clicked "Add All N Titles")
- Individual review cards (added when user clicked "Add to List" on individual cards)
- Remaining review rows (added when user clicked "Add Remaining N to List")
- Duplicates (added only if user clicked "Import Anyway")

---

## 17. Import Report (Step: `report`)

### Updated report structure
```typescript
interface ImportReport {
  importedCount: number
  duplicateCount: number           // how many duplicates existed
  duplicatesImported: number       // how many duplicates the user chose to import (new)
  similarFlaggedCount: number      // review rows that were imported
  failedCount: number
  ignoredEmptyRows: number         // NEW
  rows: ImportReportRow[]
  timestamp: Date
}
```

### UI summary cards
```
Import Complete

✓ Successfully Imported:  653
↺ Skipped Duplicates:       3   (only shown if duplicateCount > 0 and user skipped)
✕ Invalid Rows:              1   (only shown if failedCount > 0)
  Ignored Empty Rows:        7   (shown in muted style, below separator)

[Go to My List]    [Import More]
```

### ImportReportRow: new result value
Add `'skipped_review'` to the result union:
```typescript
result:
  | 'imported'            // TMDB-matched import
  | 'imported_reviewed'   // manually reviewed card that was imported
  | 'skipped_duplicate'   // auto-skipped duplicate
  | 'skipped_error'       // validation error
  | 'skipped_review'      // NEW — review card that user chose not to import
```

---

## 18. TMDB Matching Rules (parser.ts)

### Current bug to fix
`findTMDBMatch()` currently calls `searchMulti()` (old, biased). Change to `searchMultiNormalized()` from `lib/tmdb/api.ts`.

```typescript
// CHANGE THIS in findTMDBMatch():
import { searchMulti } from '@/lib/tmdb/api'        // ← REMOVE
import { searchMultiNormalized } from '@/lib/tmdb/api' // ← ADD

// CHANGE the call:
const { movies, series } = await searchMulti(mapped.title)   // ← REMOVE
const allResults = await searchMultiNormalized(mapped.title)  // ← USE THIS
```

After switching to `searchMultiNormalized`, the `allResults` array is already `NormalizedTMDBResult[]` in TMDB's relevance order. Remove the manual movie + series array merge.

### Scoring algorithm (unchanged, keep as-is)
| Signal | Weight |
|---|---|
| Exact title match | +0.60 |
| Partial title match | +0.30 |
| Year match | +0.20 |
| Series result + row has totalEpisodes > 1 | +0.15 |
| Series result + row has seasonNumber ≥ 1 | +0.15 |
| Movie result + row has episode/season signals (penalty) | −0.15 each |
| Type column match | +0.05 |
| Country match (normalised) | +0.10 |

### Confidence threshold
`score >= 0.55` → `status: 'matched'`  
Below 0.55 → `status: 'no_match'`  
Maximum effective score: 1.0 (capped)

---

## 19. Duplicate Detection Rules (unchanged)

Four levels, checked in order:

1. **exact_tmdb** — `mapped.tmdbId` AND existing entry has same tmdbId AND same seasonNumber → `isDuplicate: true`
2. **legacy** — Title (case-insensitive) + Country (case-insensitive) + YearMade + TotalEpisodes all match → `isDuplicate: true`
3. **exact_title** — Exact title match, different metadata → `needsReview: true`, `duplicateType: 'exact_title'`
4. **similar_title** — Normalised title (parentheticals stripped, lowercased, alphanumeric only) matches → `needsReview: true`, `duplicateType: 'similar_title'`

Season-aware key: `"${tmdbId}-S${seasonNumber ?? 'all'}"`

**In the new flow:** Levels 1 and 2 (`isDuplicate: true`) → Duplicates screen.  
Levels 3 and 4 (`needsReview: true`) → Manual Review screen.

---

## 20. Data Authority Hierarchy

### For a TMDB-matched row (applies in `buildEntryInput`)
```
Season metadata (TMDB /tv/{id}/season/{n})
  > Series metadata (TMDB /tv/{id})
  > User / Excel values

Specific rules:
  - posterUrl: seasonMeta.posterUrl > tmdbData.posterUrl > mapped.posterUrl (export fallback)
  - backdropUrl: tmdbData.backdropUrl > mapped.backdropUrl
  - yearMade: seasonMeta.year > tmdbData.year > mapped.yearMade
  - totalEpisodes: seasonMeta.episodeCount > tmdbData.totalEpisodes > mapped.totalEpisodes
  - episodeDurationMinutes: seasonMeta.avgRuntime > tmdbData.runtime > mapped.episodeDurationMinutes
  - country: tmdbData.country > mapped.country
  - ageRating: tmdbData.ageRating > mapped.ageRating
  - genres: tmdbData.genres (if non-empty) > mapped.genres

User-owned fields (NEVER overwritten by TMDB):
  - status, personalRating, dateFinished, specialNotes
```

### For a review card entry (with edits)
```
ReviewCardEdits (user edited in card form)
  > TMDB data (from manual link or existing tmdbMatch)
  > mapped (from spreadsheet)

User-owned fields (ReviewCardEdits or mapped, never TMDB):
  - status, personalRating, dateFinished, specialNotes
```

### Watch hours calculation
```
Priority: seasonMeta.episodeCount × seasonMeta.avgRuntime / 60 (TMDB season)
  > mapped.watchHours (Excel import)
  > null
```
Note: If no TMDB season data AND no Excel watchHours, stored as null. `calculateEntryWatchHours()` in `utils/watchTime.ts` will compute it on-the-fly from `totalEpisodes × episodeDurationMinutes` for dashboard display.

---

## 21. `buildImportPreview` Return Type Change

```typescript
// BEFORE
export async function buildImportPreview(
  data: ParsedImportData,
  existingEntries: MediaEntry[],
  onProgress?: (current: number, total: number) => void
): Promise<ImportPreviewRow[]>

// AFTER
export async function buildImportPreview(
  data: ParsedImportData,
  existingEntries: MediaEntry[],
  onProgress?: (current: number, total: number) => void
): Promise<{ rows: ImportPreviewRow[]; ignoredEmptyRows: number }>
```

---

## 22. `buildEntryInput` Signature Change

```typescript
// BEFORE
async function buildEntryInput(
  row: ImportPreviewRow
): Promise<{ input: Omit<MediaEntryInput, 'userId'>; tmdbTitle: string | null }>

// AFTER
async function buildEntryInput(
  row: ImportPreviewRow,
  edits?: ReviewCardEdits,      // optional user overrides from review card
  tmdbLink?: NormalizedTMDBResult  // optional manual TMDB link from review card
): Promise<{ input: Omit<MediaEntryInput, 'userId'>; tmdbTitle: string | null }>
```

When `tmdbLink` is provided, it overrides `row.tmdbMatch.result` for resolving `resolvedTmdbId` and `type`.  
When `edits` is provided, merge them on top of `mapped` BEFORE applying TMDB overrides (except user-owned fields which always come from edits or mapped, never from TMDB).

---

## 23. Page State Flow — Detailed

### After `buildImportPreview` completes
```typescript
const { rows, ignoredEmptyRows } = await buildImportPreview(...)

const matched = rows.filter(r =>
  r.tmdbMatch.status === 'matched' &&
  r.errors.length === 0 &&
  !r.isDuplicate
)
const review = rows.filter(r =>
  r.errors.length === 0 &&
  !r.isDuplicate &&
  r.tmdbMatch.status === 'no_match'
)
// Note: needsReview rows with no TMDB match → review
// Note: needsReview rows WITH tmdb match → matched (TMDB match wins for categorization)
const duplicates = rows.filter(r => r.isDuplicate)
const errors = rows.filter(r => r.errors.length > 0 && !r.isEmptyRow)

setAllRows(rows)
setIgnoredEmptyRows(ignoredEmptyRows)
setMatchedRows(matched)
setReviewRows(review)
setReviewQueue(review)   // reviewQueue is mutable, starts equal to reviewRows
setDuplicateRows(duplicates)
setErrorRows(errors)
setStep('summary')
```

### After "Add All N Titles" (matched screen)
```typescript
async function handleImportMatched() {
  // Build all entry inputs (this fetches full TMDB metadata per row)
  const inputs = []
  for (const row of matchedRows) {
    const { input } = await buildEntryInput(row)
    inputs.push(input)
  }
  setPendingImports(prev => [...prev, ...inputs])
  // Navigate to next appropriate step
  if (reviewQueue.length > 0) setStep('review')
  else if (duplicateRows.length > 0) setStep('duplicates')
  else setStep('importing')
}
```

### After individual "Add to List" (review card)
```typescript
async function handleAddOne(rowIndex: number) {
  const row = reviewQueue.find(r => r.rowIndex === rowIndex)!
  const edits = reviewEdits[rowIndex]
  const tmdbLink = reviewTmdbLinks[rowIndex]
  const { input } = await buildEntryInput(row, edits, tmdbLink)
  setPendingImports(prev => [...prev, input])
  setReviewQueue(prev => prev.filter(r => r.rowIndex !== rowIndex))
}
```

### After "Add Remaining N" (review screen)
```typescript
async function handleAddRemaining() {
  const inputs = []
  for (const row of reviewQueue) {
    const edits = reviewEdits[row.rowIndex]
    const tmdbLink = reviewTmdbLinks[row.rowIndex]
    const { input } = await buildEntryInput(row, edits, tmdbLink)
    inputs.push(input)
  }
  setPendingImports(prev => [...prev, ...inputs])
  setReviewQueue([])
  if (duplicateRows.length > 0) setStep('duplicates')
  else setStep('importing')
}
```

### After "Don't Add Remaining" (review screen)
```typescript
function handleSkipRemaining() {
  setReviewQueue([])
  if (duplicateRows.length > 0) setStep('duplicates')
  else if (pendingImports.length > 0) setStep('importing')
  else setStep('report')  // nothing to import at all
}
```

### After duplicates decision
```typescript
async function handleDuplicatesDecision(importThem: boolean) {
  if (importThem) {
    const inputs = []
    for (const row of duplicateRows) {
      const { input } = await buildEntryInput(row)
      inputs.push(input)
    }
    setPendingImports(prev => [...prev, ...inputs])
  }
  setStep('importing')
}
```

### The actual Firestore write (step: `importing`)
```typescript
async function handleDoImport() {
  setStep('importing')
  if (pendingImports.length === 0) {
    // Nothing to write — build report and go straight to report
    buildAndSetReport(0)
    setStep('report')
    return
  }
  const count = await batchCreateMediaEntries(user.uid, pendingImports)
  await loadEntries()
  buildAndSetReport(count)
  setStep('report')
}
```

---

## 24. Import Report Construction

```typescript
function buildAndSetReport(importedCount: number) {
  const rows: ImportReportRow[] = []

  // Matched rows that were imported
  for (const row of matchedRows) {
    const inPending = pendingImports.some(/* match by title/tmdbId */)
    rows.push({
      rowIndex: row.rowIndex,
      title: getDisplayTitle({ title: row.mapped.title!, seasonNumber: row.mapped.seasonNumber }),
      result: inPending ? 'imported' : 'skipped_review',
      reason: inPending ? `TMDB: "${row.tmdbMatch.result?.title}"` : 'Not imported',
      tmdbMatch: row.tmdbMatch.result?.title ?? null,
    })
  }

  // Review rows
  for (const row of reviewRows) {
    const inPending = /* check if this row was added to pendingImports */
    rows.push({
      rowIndex: row.rowIndex,
      title: getDisplayTitle({ title: row.mapped.title!, seasonNumber: row.mapped.seasonNumber }),
      result: inPending ? 'imported_reviewed' : 'skipped_review',
      reason: inPending ? 'Imported after manual review' : 'Skipped during review',
      tmdbMatch: reviewTmdbLinks[row.rowIndex]?.title ?? null,
    })
  }

  // Duplicates
  for (const row of duplicateRows) {
    const inPending = /* check if imported anyway */
    rows.push({
      rowIndex: row.rowIndex,
      title: getDisplayTitle({ title: row.mapped.title!, seasonNumber: row.mapped.seasonNumber }),
      result: inPending ? 'imported' : 'skipped_duplicate',
      reason: inPending ? 'Imported (duplicate overridden by user)' : 'Already in library',
      tmdbMatch: null,
    })
  }

  // Errors
  for (const row of errorRows) {
    rows.push({
      rowIndex: row.rowIndex,
      title: row.mapped.title ? getDisplayTitle({ title: row.mapped.title, seasonNumber: row.mapped.seasonNumber }) : '—',
      result: 'skipped_error',
      reason: row.errors.map(e => e.message).join('; '),
      tmdbMatch: null,
    })
  }

  rows.sort((a, b) => a.rowIndex - b.rowIndex)

  setImportReport({
    importedCount,
    duplicateCount: duplicateRows.length,
    duplicatesImported: importDuplicates ? duplicateRows.length : 0,
    similarFlaggedCount: reviewRows.filter(r => pendingImports.some(/* ... */)).length,
    failedCount: errorRows.length,
    ignoredEmptyRows,
    rows,
    timestamp: new Date(),
  })
}
```

**Note:** Tracking whether individual review rows ended up in `pendingImports` requires a Set of rowIndexes. Add a `pendingRowIndexes: Set<number>` state or track it during construction.

---

## 25. `isRowCompletelyEmpty` Implementation Location

In `lib/import/parser.ts`, inside `buildImportPreview()`, before the loop body:

```typescript
// Inside the for loop, first thing:
if (isRowCompletelyEmpty(row)) {
  ignoredCount++
  result.push({
    rowIndex: index + 1,
    raw: row,
    mapped: {},
    errors: [],
    isDuplicate: false,
    needsReview: false,
    reviewReason: null,
    duplicateType: null,
    similarTitles: [],
    existingEntry: undefined,
    willImport: false,
    tmdbMatch: { status: 'no_match', result: null, confidence: 0 },
    isEmptyRow: true,
  })
  onProgress?.(index + 1, data.rows.length)
  continue  // skip all further processing
}
```

Return: `return { rows: result, ignoredEmptyRows: ignoredCount }`

---

## 26. Component Design Notes

### `ManualReviewView.tsx` — performance
For 50+ review cards, use virtualization only if needed. Start with a simple `overflow-y-auto max-h-[70vh]` scrollable list. If performance is an issue, add `react-virtual` later.

### `ReviewCard.tsx` — form state
Use local `useState` for the form fields (not react-hook-form). When [Save] or [Add to List] is clicked, call the parent callbacks. This keeps cards lightweight.

### `ReviewCard.tsx` — TMDB search integration
Embed `<TMDBSearch mediaType="all" onSelect={handleTMDBSelect} />` directly inside the expanded card. The `TMDBSearch` component already handles debouncing, dropdown, and result display.

### `MatchedTitlesView.tsx` — list virtualization
For 600+ matched rows, a full render will be slow. Use a simple sliced list with "showing first 100, all will be imported" notice, OR implement windowed rendering. The simplest acceptable solution: render all but inside `overflow-y-auto max-h-[60vh]` — browsers handle this reasonably.

### Poster images
Use `<Image>` from `next/image` with `width={32} height={48}` (same as `TMDBSearch` results).

---

## 27. Things NOT to Change

- `lib/import/columnMapper.ts` — no changes
- `components/import/ImportDropzone.tsx` — no changes  
- `lib/firebase/firestore.ts` — no changes
- The TMDB scoring algorithm in `parser.ts` (only change the search function call)
- The `batchCreateMediaEntries` call signature
- The `buildEntryInput` TMDB authority logic (only ADD the edits/tmdbLink override layer)
- All existing `normalizeCountry` usage

---

## 28. Edge Cases

| Case | Handling |
|---|---|
| 0 matched rows, 0 review rows, 0 duplicates | Summary shows all zeros, Continue disabled, only Cancel available |
| All rows are empty | ignoredEmptyRows = total, all counts = 0, Continue disabled |
| All rows are duplicates | Skip matched and review steps, go straight to Duplicates |
| All rows are errors | Skip matched, review, duplicates steps. Report shows failed count. |
| TMDB API times out during `findTMDBMatch` | `try/catch` returns `{ status: 'no_match', confidence: 0 }` — row goes to Manual Review |
| TMDB API times out during `buildEntryInput` | `try/catch` — proceeds with spreadsheet data only (current behavior, unchanged) |
| User navigates Back from Matched screen | Return to Summary; `pendingImports` stays empty |
| User opens a review card, edits, then closes with Cancel | Edits are NOT saved to `reviewEdits` — local form state only |
| User edits a card, clicks Save, then "Don't Add Remaining" | That card's edits are saved in `reviewEdits` but the card is NOT imported |
| Review card has `needsReview === true` (title conflict) | Show the `reviewReason` in the card header as an amber warning. Still fully editable. |
| `reviewTmdbLinks[rowIndex]` exists but row also has `row.tmdbMatch.result` | `reviewTmdbLinks` takes precedence (user explicitly chose this link) |
| Duplicate row: `duplicateType === 'similar_title'` | This shouldn't happen — `similar_title` sets `needsReview`, not `isDuplicate`. But if it somehow does, treat as a review row. |
| `pendingImports` is empty when user clicks "Skip All Duplicates" | Go to `'report'` directly, importedCount = 0 |

---

## 29. Implementation Order (recommended)

1. **`types/import.ts`** — add `isEmptyRow`, `ignoredEmptyRows`, `duplicatesImported`, `'skipped_review'`
2. **`lib/import/parser.ts`** — empty row guard, fix `searchMultiNormalized` call, update return type
3. **`components/import/ImportSummary.tsx`** — new, simple stat display
4. **`components/import/MatchedTitlesView.tsx`** — new, poster list
5. **`components/import/ReviewCard.tsx`** — new, most complex component
6. **`components/import/ManualReviewView.tsx`** — new, wraps ReviewCards
7. **`components/import/DuplicatesView.tsx`** — new, simple
8. **`components/import/ImportReport.tsx`** — update to show `ignoredEmptyRows`
9. **`app/(protected)/import/page.tsx`** — full rewrite tying everything together

Build and verify after each step. The page rewrite (step 9) should be done last since it depends on all other components.

---

## 30. Confirmations Required After Implementation

1. ✓ Empty rows are NOT counted as errors — verified by importing a file with blank rows
2. ✓ "Add Remaining X to List" imports all remaining review entries whether edited or not
3. ✓ Matched titles and review titles are never mixed in the same screen
4. ✓ Duplicates have their own screen separate from review
5. ✓ Individual "Add to List" decrements the Remaining counter
6. ✓ "Save" keeps the card in queue without importing
7. ✓ TMDB search inside review card populates form fields
8. ✓ `searchMultiNormalized` is used in `findTMDBMatch` (unbiased results)
9. ✓ Import report shows `ignoredEmptyRows` separately from failed count
10. ✓ User can reach the final report even if they skip everything (0 imports)

---

*End of handoff document.*
*This document was generated after a full codebase audit on 2026-06-02.*
*All file paths are relative to `C:\Users\Jayson\CLAUDE\movielogger`.*
