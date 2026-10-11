import type { IntervalPreview, ReviewGrade } from '@post-anki/shared'

import { describeIntervalSeconds, formatIntervalSeconds } from './anki-review-interval'

const GRADES: { grade: ReviewGrade; label: string; shortcut: string }[] = [
  { grade: 'again', label: 'Again', shortcut: '1' },
  { grade: 'hard', label: 'Hard', shortcut: '2' },
  { grade: 'good', label: 'Good', shortcut: '3' },
  { grade: 'easy', label: 'Easy', shortcut: '4' },
]

export function AnkiReviewGradeButtons({
  disabled,
  intervalPreview,
  onGrade,
}: {
  disabled: boolean
  intervalPreview: IntervalPreview
  onGrade: (grade: ReviewGrade) => void
}) {
  return (
    <div data-testid="anki-review-grades" className="grid grid-cols-4 gap-2">
      {GRADES.map(({ grade, label, shortcut }) => (
        <button
          key={grade}
          type="button"
          data-testid={`anki-review-grade-${grade}`}
          aria-label={`${label}, next in ${describeIntervalSeconds(intervalPreview[grade])}`}
          disabled={disabled}
          onClick={() => onGrade(grade)}
          className="flex min-h-11 flex-col items-center justify-center rounded-md border border-neutral-200 px-3 py-2 text-sm font-medium hover:bg-neutral-50 disabled:opacity-40 sm:min-h-0"
        >
          <span
            data-testid={`anki-review-grade-${grade}-interval`}
            className="text-xs text-neutral-500"
          >
            {formatIntervalSeconds(intervalPreview[grade])}
          </span>
          <span>{label}</span>
          <kbd className="text-xs text-neutral-600">{shortcut}</kbd>
        </button>
      ))}
    </div>
  )
}
