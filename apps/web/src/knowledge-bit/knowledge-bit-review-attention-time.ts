const MINUTE_MS = 60_000
const HOUR_MS = 60 * MINUTE_MS
const DAY_MS = 24 * HOUR_MS

function plural(count: number, unit: string): string {
  return `${count} ${unit}${count === 1 ? '' : 's'} ago`
}

export function formatAttentionAge(since: string, now: Date = new Date()): string {
  const elapsed = now.getTime() - new Date(since).getTime()

  if (Number.isNaN(elapsed) || elapsed < MINUTE_MS) {
    return 'just now'
  }

  if (elapsed < HOUR_MS) {
    return plural(Math.floor(elapsed / MINUTE_MS), 'minute')
  }

  if (elapsed < DAY_MS) {
    return plural(Math.floor(elapsed / HOUR_MS), 'hour')
  }

  return plural(Math.floor(elapsed / DAY_MS), 'day')
}
