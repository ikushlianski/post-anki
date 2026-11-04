import { useEffect, useState } from 'react'

import { getStreak } from '../curriculum/stats.api'

export function AnkiReviewStreak() {
  const [days, setDays] = useState(0)

  useEffect(() => {
    let active = true

    async function load() {
      try {
        const streak = await getStreak()

        if (active) {
          setDays(streak?.currentStreak ?? 0)
        }
      } catch {
        return
      }
    }

    void load()

    return () => {
      active = false
    }
  }, [])

  if (days <= 0) {
    return null
  }

  return (
    <p data-testid="anki-review-streak" className="text-sm text-neutral-500">
      Streak: {days} {days === 1 ? 'day' : 'days'}
    </p>
  )
}
