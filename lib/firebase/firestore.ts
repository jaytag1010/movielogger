import {
  collection,
  doc,
  addDoc,
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
import { generateInternalId } from '@/utils/idGenerator'

const COLLECTION = 'mediaEntries'

function db() {
  return getFirestore(initApp())
}

export async function createMediaEntry(
  userId: string,
  input: Omit<MediaEntryInput, 'userId'>
): Promise<MediaEntry> {
  const internalId = await generateInternalId(userId)

  const entry = {
    ...input,
    userId,
    internalId,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  }

  const docRef = await addDoc(collection(db(), COLLECTION), entry)
  const snap = await getDoc(docRef)
  return { id: snap.id, ...snap.data() } as MediaEntry
}

export async function updateMediaEntry(
  entryId: string,
  updates: MediaEntryUpdate
): Promise<void> {
  const docRef = doc(db(), COLLECTION, entryId)
  await updateDoc(docRef, {
    ...updates,
    updatedAt: serverTimestamp(),
  })
}

export async function deleteMediaEntry(entryId: string): Promise<void> {
  await deleteDoc(doc(db(), COLLECTION, entryId))
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
  return snap.docs.map((d) => ({ id: d.id, ...d.data() } as MediaEntry))
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
  const entries = snap.docs.map((d) => ({ id: d.id, ...d.data() } as MediaEntry))
  const newLastDoc = snap.docs.length > 0 ? snap.docs[snap.docs.length - 1] : null

  return { entries, lastDoc: newLastDoc }
}

export async function batchCreateMediaEntries(
  userId: string,
  inputs: Omit<MediaEntryInput, 'userId'>[],
  onProgress?: (current: number, total: number) => void
): Promise<number> {
  // 100-entry chunks: each commit() call advances the progress bar,
  // giving ~10 visible updates for a 1000-row import.
  const BATCH_SIZE = 100
  let importedCount = 0

  for (let i = 0; i < inputs.length; i += BATCH_SIZE) {
    const firestore = db()
    const batch = writeBatch(firestore)
    const chunk = inputs.slice(i, i + BATCH_SIZE)

    for (const input of chunk) {
      const internalId = await generateInternalId(userId)
      const docRef = doc(collection(firestore, COLLECTION))
      batch.set(docRef, {
        ...input,
        userId,
        internalId,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      })
    }

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
