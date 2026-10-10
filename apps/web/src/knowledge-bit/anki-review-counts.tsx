import type { ReviewCounts } from '@post-anki/shared'

const ENTRIES: { key: keyof ReviewCounts; label: string }[] = [
  { key: 'new', label: 'New' },
  { key: 'learning', label: 'Learning' },
  { key: 'review', label: 'Due' },
]

export function AnkiReviewCounts({ counts }: { counts: ReviewCounts }) {
  return (
    <div className="mb-4 flex flex-col gap-1">
      <div data-testid="anki-review-counts" className="flex gap-4 text-sm text-neutral-500">
        {ENTRIES.map(({ key, label }) => (
          <span key={key}>
            {label}{' '}
            <strong data-testid={`anki-review-count-${key}`} className="text-neutral-900">
              {counts[key]}
            </strong>
          </span>
        ))}
      </div>
      <p data-testid="anki-review-counts-legend" className="text-xs text-neutral-500">
        New: never studied. Learning: still being learned today. Due: scheduled for today or earlier.
      </p>
    </div>
  )
}
