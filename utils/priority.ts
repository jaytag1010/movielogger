const FILLED_STAR = '\u2605'
const EMPTY_STAR = '\u2606'

export function normalizePriority(priority: number | null | undefined): number {
  return Math.min(5, Math.max(1, priority ?? 3))
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
