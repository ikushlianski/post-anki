import { Link } from '@tanstack/react-router'
import { formatReviewNextDue } from './format-review-next-due'
import { SubjectForecastLoader } from '../study-plan/study-forecast-compact'
import { AnkiReviewStreak } from './anki-review-streak'
import { getDailyReviewCount } from './daily-review-storage'

function NextSteps() {
  return (
    <div className="flex gap-4 text-sm">
      <Link to="/add-knowledge" className="inline-flex min-h-[44px] items-center text-indigo-600 hover:underline sm:min-h-0">
        Add knowledge
      </Link>
      <Link to="/knowledge-bit-review" className="inline-flex min-h-[44px] items-center text-indigo-600 hover:underline sm:min-h-0">
        Knowledge triage
      </Link>
    </div>
  )
}

export function AnkiReviewDone({
  nextDueAt,
  noApprovedCards,
  newLimitReached = false,
  subjectId,
  onStudyAhead,
}: {
  nextDueAt: string | null
  noApprovedCards: boolean
  newLimitReached?: boolean
  subjectId?: string
  onStudyAhead?: () => void
}) {
  if (noApprovedCards) {
    return (
      <div role="status" data-testid="anki-review-done" className="flex flex-col gap-2">
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

  return (
    <div role="status" data-testid="anki-review-done" className="flex flex-col gap-2">
      <div className="flex flex-col gap-1">
        <p className="text-lg font-medium">Done for today</p>
        {reviewedToday > 0 && (
          <p className="text-sm text-neutral-500">
            {reviewedToday} card{reviewedToday === 1 ? '' : 's'} reviewed today
          </p>
        )}
        <AnkiReviewStreak />
        <p className="text-sm text-neutral-500">
          {nextDueAt
            ? `Next card due ${formatReviewNextDue(nextDueAt)}`
            : 'No more cards are scheduled.'}
        </p>
      </div>
      {onStudyAhead && (
        <button
          type="button"
          data-testid="anki-review-study-ahead"
          onClick={onStudyAhead}
          className="min-h-[44px] self-start rounded-md border border-neutral-300 px-3 text-sm font-medium"
        >
          Study ahead anyway
        </button>
      )}
      {newLimitReached && (
        <p data-testid="anki-review-new-limit-reached" className="text-sm text-neutral-500">
          Daily new-card limit reached. Change it in{' '}
          <Link to="/admin-settings" className="inline-flex min-h-[44px] items-center text-indigo-600 hover:underline sm:min-h-0">
            settings
          </Link>
          .
        </p>
      )}
      {subjectId && <SubjectForecastLoader subjectId={subjectId} />}
      <p className="text-sm text-neutral-500">Want more cards? Add knowledge or approve suggested questions.</p>
      <NextSteps />
    </div>
  )
}
