const FILLED_STAR = '\u2605'
const EMPTY_STAR = '\u2606'

export function normalizePriority(priority: number | null | undefined): number {
  const numeric = Number(priority ?? 3)
  return Math.min(5, Math.max(1, Number.isFinite(numeric) ? numeric : 3))
}

export function getPriorityDisplay(priority: number | null | undefined) {
  const value = normalizePriority(priority)
  const tone =
    value === 5
      ? 'text-red-400 border-red-500/30 bg-red-500/10'
      : value === 4
        ? 'text-orange-600 border-orange-500/30 bg-orange-500/10'
        : value === 3
          ? 'text-orange-400 border-orange-400/30 bg-orange-400/10'
          : value === 2
            ? 'text-slate-300 border-slate-300/25 bg-slate-300/5'
            : 'text-zinc-500 border-zinc-500/25 bg-zinc-500/5'

  return {
    value,
    filled: FILLED_STAR.repeat(value),
    empty: EMPTY_STAR.repeat(5 - value),
    tone,
  }
}

interface PrioritySortable {
  priority?: number | null
  priorityUpdatedAt?: { toMillis?: () => number } | null
}

function priorityUpdatedMillis(entry: PrioritySortable): number {
  return entry.priorityUpdatedAt?.toMillis?.() ?? 0
}

export function comparePriorityDescThenUpdatedDesc(a: PrioritySortable, b: PrioritySortable): number {
  const priorityDiff = normalizePriority(b.priority) - normalizePriority(a.priority)
  if (priorityDiff !== 0) return priorityDiff
  return priorityUpdatedMillis(b) - priorityUpdatedMillis(a)
}

export function comparePriorityAscThenUpdatedDesc(a: PrioritySortable, b: PrioritySortable): number {
  const priorityDiff = normalizePriority(a.priority) - normalizePriority(b.priority)
  if (priorityDiff !== 0) return priorityDiff
  return priorityUpdatedMillis(b) - priorityUpdatedMillis(a)
}
