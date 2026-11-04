function localDateKey(date: Date): string {
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')

  return `review-count-${date.getFullYear()}-${month}-${day}`
}

function todayKey(): string {
  return localDateKey(new Date())
}

export function getDailyReviewCount(): number {
  try {
    const raw = localStorage.getItem(todayKey())

    if (raw === null) {
      return 0
    }

    const parsed = parseInt(raw, 10)

    return Number.isNaN(parsed) ? 0 : parsed
  } catch {
    return 0
  }
}

export function incrementDailyReviewCount(): void {
  try {
    const key = todayKey()
    const current = getDailyReviewCount()

    localStorage.setItem(key, String(current + 1))
  } catch {
    // storage quota exceeded or unavailable — silently ignore
  }
}
