import { doc, runTransaction, getFirestore } from 'firebase/firestore'
import { initApp } from '@/lib/firebase/config'

export function formatInternalId(num: number): string {
  return `ML-${String(num).padStart(6, '0')}`
}

export async function generateInternalId(userId: string): Promise<string> {
  const firestore = getFirestore(initApp())
  const counterRef = doc(firestore, 'counters', `user_${userId}`)

  const nextId = await runTransaction(firestore, async (transaction) => {
    const counterDoc = await transaction.get(counterRef)
    const currentCount = counterDoc.exists() ? (counterDoc.data().count as number) : 0
    const newCount = currentCount + 1
    transaction.set(counterRef, { count: newCount })
    return newCount
  })

  return formatInternalId(nextId)
}

export function parseInternalIdNumber(internalId: string): number | null {
  const match = internalId.match(/^ML-(\d+)$/)
  if (!match) return null
  return parseInt(match[1], 10)
}
