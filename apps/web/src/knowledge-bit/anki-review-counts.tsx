import type { ReviewCounts } from '@post-anki/shared'

const ENTRIES: { key: keyof ReviewCounts; label: string }[] = [
  { key: 'new', label: 'New' },
  { key: 'learning', label: 'Learning' },
  { key: 'review', label: 'Due' },
]

export function AnkiReviewCounts({ counts }: { counts: ReviewCounts }) {
  return (
    <div data-testid="anki-review-counts" className="mb-4 flex gap-4 text-sm text-neutral-500">
      {ENTRIES.map(({ key, label }) => (
        <span key={key}>
          {label}{' '}
          <strong data-testid={`anki-review-count-${key}`} className="text-neutral-900">
            {counts[key]}
          </strong>
        </span>
      ))}
    </div>
  )
}
