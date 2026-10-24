import { Link } from '@tanstack/react-router'
import { getDailyReviewCount, getStudyStreak } from './daily-review-storage'

function formatNextDue(iso: string): string {
  const due = new Date(iso)
  const now = new Date()
  const diffMs = due.getTime() - now.getTime()
  const diffMins = Math.round(diffMs / 60000)
  const diffHours = Math.round(diffMs / 3600000)

  if (diffMins < 2) return 'in less than a minute'
  if (diffMins < 60) return `in ${diffMins} minutes`
  if (diffHours < 24) return `in ${diffHours} hour${diffHours === 1 ? '' : 's'}`

  const tomorrow = new Date(now)
  tomorrow.setDate(tomorrow.getDate() + 1)
  tomorrow.setHours(0, 0, 0, 0)

  if (due < new Date(tomorrow.getTime() + 86400000)) return 'tomorrow'

  return due.toLocaleDateString(undefined, { weekday: 'long', month: 'short', day: 'numeric' })
}

function NextSteps() {
  return (
    <div className="flex gap-4 text-sm">
      <Link to="/add-knowledge" className="text-indigo-600 hover:underline">
        Add knowledge
      </Link>
      <Link to="/knowledge-bit-review" className="text-indigo-600 hover:underline">
        Approve suggestions
      </Link>
    </div>
  )
}

export function AnkiReviewDone({
  nextDueAt,
  noApprovedCards,
  newLimitReached = false,
}: {
  nextDueAt: string | null
  noApprovedCards: boolean
  newLimitReached?: boolean
}) {
  if (noApprovedCards) {
    return (
      <div data-testid="anki-review-done" className="flex flex-col gap-2">
        <p data-testid="anki-review-empty" className="text-lg font-medium">
          No cards to review yet
        </p>
        <p className="text-sm text-neutral-500">
          Cards come from questions you approve. Approve suggested questions, or add knowledge to get new ones.
        </p>
        <NextSteps />
      </div>
    )
  }

  const reviewedToday = getDailyReviewCount()
  const streak = getStudyStreak()

  return (
    <div data-testid="anki-review-done" className="flex flex-col gap-2">
      <div className="flex flex-col gap-1">
        <p className="text-lg font-medium">Done for today</p>
        {reviewedToday > 0 && (
          <p className="text-sm text-neutral-500">
            {reviewedToday} card{reviewedToday === 1 ? '' : 's'} reviewed today
            {streak > 1 ? ` · ${streak} day streak` : ''}
          </p>
        )}
        <p className="text-sm text-neutral-500">
          {nextDueAt
            ? `Next card due ${formatNextDue(nextDueAt)}`
            : 'No more cards are scheduled.'}
        </p>
      </div>
      {newLimitReached && (
        <p data-testid="anki-review-new-limit-reached" className="text-sm text-neutral-500">
          Daily new-card limit reached. Change it in{' '}
          <Link to="/admin-settings" className="text-indigo-600 hover:underline">
            settings
          </Link>
          .
        </p>
      )}
      <p className="text-sm text-neutral-500">Want more cards? Add knowledge or approve suggested questions.</p>
      <NextSteps />
    </div>
  )
}
