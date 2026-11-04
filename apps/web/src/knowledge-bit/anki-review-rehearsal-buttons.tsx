import type { ReviewGrade } from '@post-anki/shared'

const CHOICES: { grade: ReviewGrade; label: string; shortcut: string }[] = [
  { grade: 'again', label: 'Missed it', shortcut: '1' },
  { grade: 'good', label: 'Got it', shortcut: '3' },
]

export function AnkiReviewRehearsalButtons({
  disabled,
  onGrade,
}: {
  disabled: boolean
  onGrade: (grade: ReviewGrade) => void
}) {
  return (
    <div data-testid="anki-review-rehearsal-grades" className="grid grid-cols-2 gap-2">
      {CHOICES.map(({ grade, label, shortcut }) => (
        <button
          key={grade}
          type="button"
          data-testid={`anki-review-rehearsal-${grade}`}
          disabled={disabled}
          onClick={() => onGrade(grade)}
          className="flex min-h-11 flex-col items-center justify-center rounded-md border border-neutral-200 px-3 py-2 text-sm font-medium hover:bg-neutral-50 disabled:opacity-40 sm:min-h-0"
        >
          <span>{label}</span>
          <kbd className="text-xs text-neutral-600">{shortcut}</kbd>
        </button>
      ))}
    </div>
  )
}

export function AnkiReviewRehearsalLabel() {
  return (
    <p data-testid="anki-review-rehearsal-label" className="mb-2 text-sm font-medium text-indigo-700">
      Same idea, new wording
    </p>
  )
}
