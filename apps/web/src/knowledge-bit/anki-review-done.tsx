import { Link } from '@tanstack/react-router'

export function AnkiReviewDone({
  nextDueAt,
  noApprovedCards,
}: {
  nextDueAt: string | null
  noApprovedCards: boolean
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
        <div className="flex gap-4 text-sm">
          <Link to="/knowledge-bit-review" className="text-indigo-600 hover:underline">
            Approve suggestions
          </Link>
          <Link to="/add-knowledge" className="text-indigo-600 hover:underline">
            Add knowledge
          </Link>
        </div>
      </div>
    )
  }

  return (
    <div data-testid="anki-review-done" className="flex flex-col gap-1">
      <p className="text-lg font-medium">Done for today</p>
      <p className="text-sm text-neutral-500">
        {nextDueAt
          ? `Next card due ${new Date(nextDueAt).toLocaleString()}`
          : 'No more cards are scheduled.'}
      </p>
    </div>
  )
}
