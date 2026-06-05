import { doc, runTransaction, getFirestore } from 'firebase/firestore'
import { initApp } from '@/lib/firebase/config'

export function formatInternalId(num: number): string {
  return `ML-${String(num).padStart(6, '0')}`
}

export async function generateInternalId(userId: string): Promise<string> {
  const [first] = await reserveInternalIds(userId, 1)
  return first
}

/**
 * Reserve a contiguous block of `count` internal IDs in a SINGLE transaction.
 *
 * Used by bulk import so that creating N entries costs one counter transaction
 * instead of N. Returns the formatted IDs (e.g. ["ML-000101", … ]) in order.
 */
export async function reserveInternalIds(userId: string, count: number): Promise<string[]> {
  if (count <= 0) return []
  const firestore = getFirestore(initApp())
  const counterRef = doc(firestore, 'counters', `user_${userId}`)

  const startCount = await runTransaction(firestore, async (transaction) => {
    const counterDoc = await transaction.get(counterRef)
    const currentCount = counterDoc.exists() ? (counterDoc.data().count as number) : 0
    const newCount = currentCount + count
    transaction.set(counterRef, { count: newCount })
    return currentCount // first reserved number is currentCount + 1
  })

  const ids: string[] = []
  for (let i = 1; i <= count; i++) {
    ids.push(formatInternalId(startCount + i))
  }
  return ids
}

export function parseInternalIdNumber(internalId: string): number | null {
  const match = internalId.match(/^ML-(\d+)$/)
  if (!match) return null
  return parseInt(match[1], 10)
}
