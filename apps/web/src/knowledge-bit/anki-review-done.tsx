export function AnkiReviewDone({ nextDueAt }: { nextDueAt: string | null }) {
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
