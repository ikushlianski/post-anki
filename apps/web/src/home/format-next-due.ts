export function formatNextDue(nextDueAt: string, now: Date = new Date()): string {
  const due = new Date(nextDueAt)
  const minutes = Math.max(1, Math.round((due.getTime() - now.getTime()) / 60_000))

  if (minutes < 60) {
    return `in ${minutes} min`
  }

  if (minutes < 24 * 60) {
    const hours = Math.round(minutes / 60)

    return `in ${hours} hour${hours === 1 ? '' : 's'}`
  }

  const days = Math.round(minutes / (24 * 60))

  return `in ${days} day${days === 1 ? '' : 's'}`
}
