import { Timestamp } from 'firebase/firestore'
import { ActivityDetail, ActivityInput, ActivityTitleSnapshot } from '@/types/activity'
import { MediaEntry, MediaEntryUpdate } from '@/types/media'
import { getDisplayTitle, getEffectiveMediaType } from '@/utils/formatters'

const FIELD_LABELS: Partial<Record<keyof MediaEntry, string>> = {
  title: 'Title',
  type: 'Type',
  status: 'Status',
  yearMade: 'Year',
  country: 'Country',
  genres: 'Genres',
  ageRating: 'Age Rating',
  totalEpisodes: 'Total Episodes',
  episodeDurationMinutes: 'Episode Duration',
  watchHours: 'Watch Hours',
  personalRating: 'Rating',
  dateFinished: 'Date Finished',
  nextEpisodeToWatch: 'Episodes Watched',
  priority: 'Priority',
  rewatchCount: 'Rewatch Counter',
  seasonNumber: 'Season Number',
  tmdbId: 'TMDB ID',
  tmdbReleaseDate: 'TMDB Release Date',
  posterUrl: 'Poster',
  backdropUrl: 'Backdrop',
  specialNotes: 'Notes',
}

const IGNORED_FIELDS = new Set<keyof MediaEntry>([
  'updatedAt',
  'watchingActivityAt',
  'tmdbLastCheckedAt',
  'tmdbUnmatchedDismissedAt',
  'priorityUpdatedAt',
])

function formatTimestamp(value: Timestamp): string {
  return value.toDate().toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  })
}

export function formatActivityValue(value: unknown): string {
  if (value instanceof Timestamp) return formatTimestamp(value)
  if (Array.isArray(value)) return value.join(', ') || 'None'
  if (typeof value === 'number') return Number.isInteger(value) ? String(value) : value.toFixed(2)
  if (value === null || value === undefined || value === '') return 'None'
  return String(value)
}

function equivalent(a: unknown, b: unknown): boolean {
  if (a instanceof Timestamp && b instanceof Timestamp) return a.toMillis() === b.toMillis()
  if (Array.isArray(a) || Array.isArray(b)) {
    return JSON.stringify(a ?? []) === JSON.stringify(b ?? [])
  }
  return (a ?? null) === (b ?? null)
}

export function snapshotEntry(entry: MediaEntry): ActivityTitleSnapshot {
  return {
    id: entry.id,
    title: getDisplayTitle(entry),
    internalId: entry.internalId,
    yearMade: entry.yearMade,
    type: getEffectiveMediaType(entry),
    status: entry.status,
    rating: entry.personalRating,
    tmdbId: entry.tmdbId,
  }
}

export function buildTitleAddedActivity(entry: MediaEntry): ActivityInput {
  return {
    category: 'library',
    action: 'Title Added',
    title: getDisplayTitle(entry),
    internalId: entry.internalId,
    entryId: entry.id ?? null,
    summary: `${getDisplayTitle(entry)} was added to your library.`,
    snapshot: snapshotEntry(entry),
    details: [
      { label: 'Type', after: getEffectiveMediaType(entry) },
      { label: 'Status', after: entry.status },
      { label: 'ML ID', after: entry.internalId },
    ],
  }
}

export function buildTitleDeletedActivity(entry: MediaEntry): ActivityInput {
  return {
    category: 'library',
    action: 'Title Deleted',
    title: getDisplayTitle(entry),
    internalId: entry.internalId,
    entryId: entry.id ?? null,
    summary: `${getDisplayTitle(entry)} was deleted from your library.`,
    snapshot: snapshotEntry(entry),
  }
}

export function buildUpdateActivities(
  before: MediaEntry,
  updates: MediaEntryUpdate
): ActivityInput[] {
  const after = { ...before, ...updates }
  const changed = Object.entries(updates).flatMap(([field, next]) => {
    const key = field as keyof MediaEntry
    if (IGNORED_FIELDS.has(key)) return []
    const previous = before[key]
    if (equivalent(previous, next)) return []
    return [{
      label: FIELD_LABELS[key] ?? field,
      before: formatActivityValue(previous),
      after: formatActivityValue(next),
    }]
  }) as ActivityDetail[]

  if (changed.length === 0) return []

  const base = {
    title: getDisplayTitle(before),
    internalId: before.internalId,
    entryId: before.id ?? null,
    snapshot: snapshotEntry(after),
  }

  const activities: ActivityInput[] = []
  const push = (category: ActivityInput['category'], action: string, details: ActivityDetail[]) => {
    activities.push({
      ...base,
      category,
      action,
      summary: `${getDisplayTitle(before)}: ${action.toLowerCase()}.`,
      details,
    })
  }

  const find = (label: string) => changed.find((item) => item.label === label)
  const status = find('Status')
  const rating = find('Rating')
  const dateFinished = find('Date Finished')
  const episodes = find('Episodes Watched')
  const priority = find('Priority')
  const rewatch = find('Rewatch Counter')
  const tmdb = find('TMDB ID')

  if (status) {
    const action = after.status === 'completed' ? 'Marked Finished' : 'Status Changed'
    const details = [
      status,
      ...(rating ? [rating] : []),
      ...(dateFinished ? [dateFinished] : []),
    ]
    push('library', action, details)
  }
  if (rating && !status) push('library', 'Rating Changed', [rating])
  if (dateFinished && !status) push('library', 'Date Finished Changed', [dateFinished])
  if (episodes) push('library', 'Episodes Watched Changed', [episodes])
  if (priority) push('library', 'Priority Changed', [priority])
  if (rewatch) push('library', 'Rewatch Counter Changed', [rewatch])
  if (tmdb) {
    const beforeId = before.tmdbId
    const afterId = after.tmdbId
    const action = beforeId == null && afterId != null
      ? 'TMDB Linked'
      : beforeId != null && afterId == null
        ? 'TMDB Removed'
        : 'TMDB Match Changed'
    push('tmdb', action, [tmdb])
  }

  const alreadyLogged = new Set(
    activities.flatMap((activity) => activity.details?.map((detail) => detail.label) ?? [])
  )
  const remaining = changed.filter((detail) => !alreadyLogged.has(detail.label))
  if (remaining.length > 0) {
    push('library', 'Title Edited', remaining)
  }

  return activities
}
