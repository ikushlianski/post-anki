export function formatReviewNextDue(iso: string, now: Date = new Date()): string {
  const due = new Date(iso)
  const diffMs = due.getTime() - now.getTime()
  const diffMins = Math.round(diffMs / 60000)
  const diffHours = Math.round(diffMs / 3600000)

  if (diffMins < 2) return 'in less than a minute'
  if (diffMins < 60) return `in ${diffMins} minutes`
  if (diffMins < 24 * 60) return `in ${diffHours} hour${diffHours === 1 ? '' : 's'}`

  const tomorrow = new Date(now)
  tomorrow.setDate(tomorrow.getDate() + 1)
  tomorrow.setHours(0, 0, 0, 0)

  if (due < new Date(tomorrow.getTime() + 86400000)) return 'tomorrow'

  return due.toLocaleDateString(undefined, { weekday: 'long', month: 'short', day: 'numeric' })
}
