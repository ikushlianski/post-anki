import { Link } from '@tanstack/react-router'

export const REVIEW_AHEAD_DAY_OPTIONS = [1, 2, 3, 5] as const

export function AnkiReviewLimitReached({
  reviewedToday,
  limit,
  onReviewAhead,
}: {
  reviewedToday: number
  limit: number
  onReviewAhead: (days: number) => void
}) {
  return (
    <div role="status" data-testid="anki-review-limit-reached" className="flex flex-col gap-3">
      <div className="flex flex-col gap-1">
        <p className="text-lg font-medium">Done for today</p>
        <p data-testid="anki-review-limit-summary" className="text-sm text-neutral-500">
          You reviewed {reviewedToday} of {limit} cards today.
        </p>
      </div>
      <div className="flex flex-col gap-2">
        <p className="text-sm text-neutral-500">Want to keep going? Review cards that are due soon.</p>
        <div className="flex flex-wrap gap-2">
          {REVIEW_AHEAD_DAY_OPTIONS.map((days) => (
            <button
              key={days}
              type="button"
              data-testid={`anki-review-ahead-${days}`}
              onClick={() => onReviewAhead(days)}
              className="min-h-[44px] rounded-md border border-neutral-300 px-3 text-sm font-medium"
            >
              {days === 1 ? 'Next 1 day' : `Next ${days} days`}
            </button>
          ))}
        </div>
      </div>
      <Link to="/" data-testid="anki-review-limit-back" className="inline-flex min-h-[44px] items-center text-sm text-indigo-600 hover:underline sm:min-h-0">
        Back to home
      </Link>
    </div>
  )
}
