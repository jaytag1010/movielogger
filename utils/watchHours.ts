export function calculateWatchHoursFromRuntime(input: {
  totalEpisodes?: number | null
  episodeDurationMinutes?: number | null
}): number {
  const totalEpisodes = input.totalEpisodes ?? null
  const episodeDurationMinutes = input.episodeDurationMinutes ?? null

  if (
    totalEpisodes == null ||
    episodeDurationMinutes == null ||
    totalEpisodes <= 0 ||
    episodeDurationMinutes <= 0
  ) {
    return 0
  }

  return (totalEpisodes * episodeDurationMinutes) / 60
}

export function roundWatchHours(hours: number): number {
  return Math.round(hours * 100) / 100
}

export function calculateStoredWatchHours(input: {
  totalEpisodes?: number | null
  episodeDurationMinutes?: number | null
}): number {
  return roundWatchHours(calculateWatchHoursFromRuntime(input))
}

export function watchHoursDiffer(a: number | null | undefined, b: number): boolean {
  return Math.abs((a ?? 0) - b) >= 0.005
}
