import { Timestamp } from 'firebase/firestore'

export type ActivityCategory = 'library' | 'tmdb' | 'refresh' | 'import_export' | 'maintenance' | 'system'

export interface ActivityDetail {
  label: string
  before?: string | number | null
  after?: string | number | null
}

export interface ActivityTitleSnapshot {
  id?: string
  title: string
  internalId?: string | null
  yearMade?: number | null
  type?: string | null
  status?: string | null
  rating?: number | null
  tmdbId?: number | null
}

export interface ActivityEntry {
  id?: string
  userId: string
  category: ActivityCategory
  action: string
  summary: string
  title?: string | null
  internalId?: string | null
  entryId?: string | null
  createdAt: Timestamp
  details?: ActivityDetail[]
  items?: {
    title: string
    details: ActivityDetail[]
  }[]
  snapshot?: ActivityTitleSnapshot | null
  metadata?: Record<string, unknown>
}

export type ActivityInput = Omit<ActivityEntry, 'id' | 'userId' | 'createdAt'>
