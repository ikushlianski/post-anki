import type { ReviewCounts } from '@post-anki/shared'

import { CARD_MATURITY_PALETTE, type CardMaturityKind } from './card-maturity-palette'

const PARTS: { key: keyof ReviewCounts; label: string; kind: CardMaturityKind }[] = [
  { key: 'review', label: 'due', kind: 'mature' },
  { key: 'learning', label: 'learning', kind: 'learning' },
  { key: 'new', label: 'new', kind: 'new' },
]

export function reviewBandFractions(counts: ReviewCounts): Record<keyof ReviewCounts, number> {
  const total = counts.new + counts.learning + counts.review

  if (total <= 0) {
    return { new: 0, learning: 0, review: 0 }
  }

  return {
    new: counts.new / total,
    learning: counts.learning / total,
    review: counts.review / total,
  }
}

export function AnkiReviewCountsBand({ counts }: { counts: ReviewCounts }) {
  const fractions = reviewBandFractions(counts)
  const summary = PARTS.map((part) => `${counts[part.key]} ${part.label}`).join(', ')

  return (
    <span
      role="img"
      aria-label={summary}
      title={summary}
      data-testid="anki-review-counts-band"
      className="flex h-2 w-24 shrink-0 self-center overflow-hidden rounded-full bg-neutral-200 dark:bg-neutral-700 sm:w-40"
    >
      {PARTS.map((part) => (
        <span
          key={part.key}
          data-part={part.key}
          className={CARD_MATURITY_PALETTE[part.kind].fill}
          style={{ width: `${fractions[part.key] * 100}%` }}
        />
      ))}
    </span>
  )
}
