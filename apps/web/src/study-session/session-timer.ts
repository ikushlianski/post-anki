export function formatElapsedClock(elapsedMinutes: number): string {
  const safeMinutes = Math.max(0, elapsedMinutes)
  const hours = Math.floor(safeMinutes / 60)
  const minutes = safeMinutes % 60

  if (hours > 0) {
    return `${hours}h ${minutes}m`
  }

  return `${minutes}m`
}

export function formatPlannedDuration(plannedDurationMinutes: number): string {
  return `${plannedDurationMinutes} min`
}
