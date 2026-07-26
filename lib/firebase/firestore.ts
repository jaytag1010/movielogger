import {
  collection,
  doc,
  addDoc,
  setDoc,
  updateDoc,
  deleteDoc,
  getDocs,
  getDoc,
  query,
  where,
  orderBy,
  serverTimestamp,
  writeBatch,
  limit,
  startAfter,
  QueryDocumentSnapshot,
  getFirestore,
} from 'firebase/firestore'
import { initApp } from './config'
import { MediaEntry, MediaEntryInput, MediaEntryUpdate } from '@/types/media'
import { formatInternalId, generateInternalId, reserveInternalIds } from '@/utils/idGenerator'
import { normalizeCountry } from '@/utils/countries'
import { calculateStoredWatchHours, watchHoursDiffer } from '@/utils/watchHours'

const COLLECTION = 'mediaEntries'

function db() {
  return getFirestore(initApp())
}

function normalizeEntryInput<T extends Partial<MediaEntryInput | MediaEntryUpdate>>(input: T): T {
  const normalized: Record<string, unknown> = { ...input }

  if ('country' in normalized) {
    normalized.country = normalizeCountry(normalized.country as string | null | undefined)
  }

  if ('totalEpisodes' in normalized || 'episodeDurationMinutes' in normalized) {
    normalized.watchHours = calculateStoredWatchHours({
      totalEpisodes: normalized.totalEpisodes as number | null | undefined,
      episodeDurationMinutes: normalized.episodeDurationMinutes as number | null | undefined,
    })
  }

  return normalized as T
}

function migrationSort(a: { id: string; data: MediaEntry }, b: { id: string; data: MediaEntry }): number {
  const aCreated = a.data.createdAt?.toMillis?.() ?? 0
  const bCreated = b.data.createdAt?.toMillis?.() ?? 0
  if (aCreated !== bCreated) return aCreated - bCreated

  const aYear = a.data.yearMade ?? Number.MAX_SAFE_INTEGER
  const bYear = b.data.yearMade ?? Number.MAX_SAFE_INTEGER
  if (aYear !== bYear) return aYear - bYear

  const titleDiff = a.data.title.localeCompare(b.data.title)
  if (titleDiff !== 0) return titleDiff

  return a.id.localeCompare(b.id)
}

async function migrateUserEntriesIfNeeded(userId: string, docs: { id: string; data: MediaEntry }[]): Promise<MediaEntry[]> {
  const firestore = db()
  const counterRef = doc(firestore, 'counters', `user_${userId}`)
  const counterSnap = await getDoc(counterRef)
  const counter = counterSnap.exists() ? counterSnap.data() : {}
  const sortedForIds = [...docs].sort(migrationSort)
  const targetInternalIds = new Map(sortedForIds.map((item, index) => [item.id, formatInternalId(index + 1)]))
  const migratedEntries: MediaEntry[] = []
  const pendingUpdates: { id: string; updates: Record<string, unknown> }[] = []

  for (const item of docs) {
    const entry = { ...item.data }
    const updates: Record<string, unknown> = {}

    const nextInternalId = targetInternalIds.get(item.id)!
    if (entry.internalId !== nextInternalId) {
      updates.internalId = nextInternalId
      entry.internalId = nextInternalId
    }

    const normalizedCountry = normalizeCountry(entry.country)
    if (entry.country !== normalizedCountry) {
      updates.country = normalizedCountry
      entry.country = normalizedCountry
    }

    const calculatedWatchHours = calculateStoredWatchHours(entry)
    if (watchHoursDiffer(entry.watchHours, calculatedWatchHours)) {
      updates.watchHours = calculatedWatchHours
      entry.watchHours = calculatedWatchHours
    }

    if (Object.keys(updates).length > 0) {
      pendingUpdates.push({ id: item.id, updates })
    }

    migratedEntries.push(entry)
  }

  if (pendingUpdates.length > 0 || counter.count !== migratedEntries.length) {
    const CHUNK = 450
    for (let i = 0; i < pendingUpdates.length; i += CHUNK) {
      const batch = writeBatch(firestore)
      pendingUpdates.slice(i, i + CHUNK).forEach((item) => {
        batch.update(doc(firestore, COLLECTION, item.id), item.updates)
      })
      await batch.commit()
    }

    await setDoc(counterRef, {
      count: migratedEntries.length,
      compactSequentialIdsV2: true,
    }, { merge: true })
  }

  return migratedEntries
}

export async function createMediaEntry(
  userId: string,
  input: Omit<MediaEntryInput, 'userId'>
): Promise<MediaEntry> {
  const internalId = await generateInternalId(userId)

  const normalizedInput = normalizeEntryInput(input)

  const entry = {
    ...normalizedInput,
    userId,
    internalId,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
    watchingActivityAt: normalizedInput.status === 'watching' ? serverTimestamp() : null,
  }

  const docRef = await addDoc(collection(db(), COLLECTION), entry)
  const snap = await getDoc(docRef)
  return { id: snap.id, ...snap.data() } as MediaEntry
}

export async function updateMediaEntry(
  entryId: string,
  updates: MediaEntryUpdate,
  options?: {
    /**
     * When true, skip updating `updatedAt`.
     * Use this for background metadata refreshes that should not disturb
     * generic modification timestamps or progress-specific activity ordering.
     */
    preserveOrder?: boolean
  }
): Promise<void> {
  const docRef = doc(db(), COLLECTION, entryId)
  const currentSnap = await getDoc(docRef)
  const current = currentSnap.exists() ? currentSnap.data() as MediaEntry : null
  const source = current ? { ...current, ...updates } : updates
  const normalizedUpdates = normalizeEntryInput(source)
  const payload: Record<string, unknown> = { ...updates }
  if ('country' in normalizedUpdates) payload.country = normalizedUpdates.country
  if ('watchHours' in normalizedUpdates) payload.watchHours = normalizedUpdates.watchHours
  if (
    ('nextEpisodeToWatch' in updates && updates.nextEpisodeToWatch !== current?.nextEpisodeToWatch) ||
    (updates.status === 'watching' && current?.status !== 'watching')
  ) {
    payload.watchingActivityAt = serverTimestamp()
  }
  if (!options?.preserveOrder) {
    payload.updatedAt = serverTimestamp()
  }
  await updateDoc(docRef, payload)
}

export async function deleteMediaEntry(entryId: string): Promise<void> {
  const firestore = db()
  const docRef = doc(firestore, COLLECTION, entryId)
  const snap = await getDoc(docRef)
  if (!snap.exists()) return
  const userId = (snap.data() as MediaEntry).userId
  await deleteDoc(docRef)
  await compactUserInternalIds(userId)
}

async function compactUserInternalIds(userId: string): Promise<void> {
  const firestore = db()
  const q = query(collection(firestore, COLLECTION), where('userId', '==', userId))
  const snap = await getDocs(q)
  const docs = snap.docs.map((d) => ({ id: d.id, data: { id: d.id, ...d.data() } as MediaEntry }))
  const sorted = docs.sort(migrationSort)

  const CHUNK = 450
  for (let i = 0; i < sorted.length; i += CHUNK) {
    const batch = writeBatch(firestore)
    sorted.slice(i, i + CHUNK).forEach((item, offset) => {
      const nextId = formatInternalId(i + offset + 1)
      if (item.data.internalId !== nextId) {
        batch.update(doc(firestore, COLLECTION, item.id), { internalId: nextId })
      }
    })
    await batch.commit()
  }

  await setDoc(doc(firestore, 'counters', `user_${userId}`), {
    count: sorted.length,
    compactSequentialIdsV2: true,
  }, { merge: true })
}

export async function getMediaEntry(entryId: string): Promise<MediaEntry | null> {
  const snap = await getDoc(doc(db(), COLLECTION, entryId))
  if (!snap.exists()) return null
  return { id: snap.id, ...snap.data() } as MediaEntry
}

export async function getUserMediaEntries(userId: string): Promise<MediaEntry[]> {
  // NOTE: No orderBy here intentionally.
  // Firestore silently drops documents missing the ordered field, which would
  // exclude any legacy / manually-created documents without `createdAt`.
  // Sorting is handled client-side inside getFilteredEntries() in useMedia.ts.
  const q = query(
    collection(db(), COLLECTION),
    where('userId', '==', userId)
  )
  const snap = await getDocs(q)
  const docs = snap.docs.map((d) => ({ id: d.id, data: { id: d.id, ...d.data() } as MediaEntry }))
  return migrateUserEntriesIfNeeded(userId, docs)
}

export async function getUserMediaEntriesPaginated(
  userId: string,
  pageSize: number,
  lastDoc?: QueryDocumentSnapshot
): Promise<{ entries: MediaEntry[]; lastDoc: QueryDocumentSnapshot | null }> {
  let q = query(
    collection(db(), COLLECTION),
    where('userId', '==', userId),
    orderBy('createdAt', 'desc'),
    limit(pageSize)
  )

  if (lastDoc) {
    q = query(
      collection(db(), COLLECTION),
      where('userId', '==', userId),
      orderBy('createdAt', 'desc'),
      startAfter(lastDoc),
      limit(pageSize)
    )
  }

  const snap = await getDocs(q)
  const entries = snap.docs.map((d) => normalizeEntryInput({ id: d.id, ...d.data() } as MediaEntry) as MediaEntry)
  const newLastDoc = snap.docs.length > 0 ? snap.docs[snap.docs.length - 1] : null

  return { entries, lastDoc: newLastDoc }
}

export async function batchCreateMediaEntries(
  userId: string,
  inputs: Omit<MediaEntryInput, 'userId'>[],
  onProgress?: (current: number, total: number) => void
): Promise<number> {
  if (inputs.length === 0) return 0

  // Reserve ALL internal IDs in a single counter transaction up front.
  // Previously this ran one transaction per entry — the dominant cost that
  // made the write phase hang after the build progress reached 100%.
  const ids = await reserveInternalIds(userId, inputs.length)

  // 100-entry chunks: each commit() call advances the progress bar.
  const BATCH_SIZE = 100
  let importedCount = 0

  for (let i = 0; i < inputs.length; i += BATCH_SIZE) {
    const firestore = db()
    const batch = writeBatch(firestore)
    const chunk = inputs.slice(i, i + BATCH_SIZE)

    chunk.forEach((input, j) => {
      const docRef = doc(collection(firestore, COLLECTION))
      const normalizedInput = normalizeEntryInput(input)
      batch.set(docRef, {
        ...normalizedInput,
        userId,
        internalId: ids[i + j],
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
        watchingActivityAt: normalizedInput.status === 'watching' ? serverTimestamp() : null,
      })
    })

    await batch.commit()
    importedCount += chunk.length
    // Report progress only after a real commit — no false positives.
    onProgress?.(importedCount, inputs.length)
  }

  return importedCount
}

export async function checkDuplicateByTitle(
  userId: string,
  title: string
): Promise<MediaEntry | null> {
  const q = query(
    collection(db(), COLLECTION),
    where('userId', '==', userId),
    where('title', '==', title),
    limit(1)
  )
  const snap = await getDocs(q)
  if (snap.empty) return null
  const d = snap.docs[0]
  return { id: d.id, ...d.data() } as MediaEntry
}

export async function checkDuplicateByTmdbId(
  userId: string,
  tmdbId: number
): Promise<MediaEntry | null> {
  const q = query(
    collection(db(), COLLECTION),
    where('userId', '==', userId),
    where('tmdbId', '==', tmdbId),
    limit(1)
  )
  const snap = await getDocs(q)
  if (snap.empty) return null
  const d = snap.docs[0]
  return { id: d.id, ...d.data() } as MediaEntry
}

/**
 * Permanently deletes ALL media entries belonging to a user.
 * Also resets the user's internal-ID counter.
 * This operation is irreversible.
 */
export async function deleteAllUserEntries(userId: string): Promise<number> {
  const firestore = db()
  const CHUNK = 499

  const q = query(collection(firestore, COLLECTION), where('userId', '==', userId))
  const snap = await getDocs(q)

  if (snap.empty) return 0

  let deleted = 0
  const docs = snap.docs

  for (let i = 0; i < docs.length; i += CHUNK) {
    const batch = writeBatch(firestore)
    docs.slice(i, i + CHUNK).forEach((d) => batch.delete(d.ref))
    await batch.commit()
    deleted += Math.min(CHUNK, docs.length - i)
  }

  // Reset the counter so IDs restart from ML-000001 after clearing
  const counterRef = doc(firestore, 'counters', `user_${userId}`)
  await deleteDoc(counterRef)

  return deleted
}

// ── User Profile ──────────────────────────────────────────────────────────────

const PROFILES_COLLECTION = 'userProfiles'

export interface UserProfile {
  displayName: string | null
  profilePhotoUrl: string | null
}

/** Fetch the user's customization profile. Returns defaults if no doc exists. */
export async function getUserProfile(userId: string): Promise<UserProfile> {
  const snap = await getDoc(doc(db(), PROFILES_COLLECTION, userId))
  if (!snap.exists()) return { displayName: null, profilePhotoUrl: null }
  const data = snap.data()
  return {
    displayName: data.displayName ?? null,
    profilePhotoUrl: data.profilePhotoUrl ?? null,
  }
}

/** Merge updates into the user's customization profile (creates if missing). */
export async function updateUserProfile(
  userId: string,
  updates: Partial<UserProfile>
): Promise<void> {
  await setDoc(doc(db(), PROFILES_COLLECTION, userId), updates, { merge: true })
}
