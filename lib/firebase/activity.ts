import {
  Timestamp,
  addDoc,
  collection,
  doc,
  getDocs,
  getFirestore,
  orderBy,
  query,
  runTransaction,
  serverTimestamp,
  where,
  writeBatch,
} from 'firebase/firestore'
import { initApp } from '@/lib/firebase/config'
import { ActivityEntry, ActivityInput } from '@/types/activity'

const COLLECTION = 'activityHistory'
const STATE_COLLECTION = 'activityStates'
const MAX_ACTIVITIES = 500
const RETENTION_DAYS = 90

function db() {
  return getFirestore(initApp())
}

function cutoffDate(): Date {
  const cutoff = new Date()
  cutoff.setDate(cutoff.getDate() - RETENTION_DAYS)
  return cutoff
}

export async function ensureActivityHistoryEnabled(userId: string): Promise<void> {
  const firestore = db()
  const stateRef = doc(firestore, STATE_COLLECTION, userId)
  const shouldCreate = await runTransaction(firestore, async (transaction) => {
    const snap = await transaction.get(stateRef)
    if (snap.exists() && snap.data().enabled) return false
    transaction.set(stateRef, {
      enabled: true,
      enabledAt: serverTimestamp(),
    }, { merge: true })
    return true
  })

  if (shouldCreate) {
    await addActivity(userId, {
      category: 'system',
      action: 'Activity History Enabled',
      summary: 'Activity tracking has started. Future library actions will now be recorded.',
    }, { skipPrune: true })
  }
}

export async function addActivity(
  userId: string,
  input: ActivityInput,
  options: { skipPrune?: boolean } = {}
): Promise<void> {
  await addDoc(collection(db(), COLLECTION), {
    ...input,
    userId,
    createdAt: serverTimestamp(),
  })
  if (!options.skipPrune) {
    await pruneActivities(userId)
  }
}

export async function getUserActivities(userId: string): Promise<ActivityEntry[]> {
  const q = query(
    collection(db(), COLLECTION),
    where('userId', '==', userId),
    orderBy('createdAt', 'desc')
  )
  const snap = await getDocs(q)
  return snap.docs.map((item) => ({ id: item.id, ...item.data() } as ActivityEntry))
}

export async function clearUserActivities(userId: string): Promise<number> {
  const q = query(collection(db(), COLLECTION), where('userId', '==', userId))
  const snap = await getDocs(q)
  let cleared = 0
  const CHUNK = 450
  for (let i = 0; i < snap.docs.length; i += CHUNK) {
    const batch = writeBatch(db())
    snap.docs.slice(i, i + CHUNK).forEach((item) => batch.delete(item.ref))
    await batch.commit()
    cleared += Math.min(CHUNK, snap.docs.length - i)
  }
  return cleared
}

export async function pruneActivities(userId: string): Promise<void> {
  const q = query(
    collection(db(), COLLECTION),
    where('userId', '==', userId),
    orderBy('createdAt', 'desc')
  )
  const snap = await getDocs(q)
  const cutoff = Timestamp.fromDate(cutoffDate()).toMillis()
  const toDelete = snap.docs.filter((item, index) => {
    const data = item.data()
    const createdAt = data.createdAt as Timestamp | undefined
    const tooOld = createdAt ? createdAt.toMillis() < cutoff : false
    return index >= MAX_ACTIVITIES || tooOld
  })

  const CHUNK = 450
  for (let i = 0; i < toDelete.length; i += CHUNK) {
    const batch = writeBatch(db())
    toDelete.slice(i, i + CHUNK).forEach((item) => batch.delete(item.ref))
    await batch.commit()
  }
}
