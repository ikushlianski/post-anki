import type { ReviewGrade, ReviewStatistics } from '@post-anki/shared'

import { formatPercent, scaleLinear } from './chart-scale'

const GRADES: readonly { grade: ReviewGrade; label: string }[] = [
  { grade: 'again', label: 'Again' },
  { grade: 'hard', label: 'Hard' },
  { grade: 'good', label: 'Good' },
  { grade: 'easy', label: 'Easy' },
]

export function AnswerButtonsChart({ answerButtons }: { answerButtons: ReviewStatistics['answerButtons'] }) {
  const max = Math.max(0, ...GRADES.map(({ grade }) => answerButtons.counts[grade]))
  const scale = scaleLinear(max, 100)

  if (answerButtons.total === 0) {
    return (
      <p data-testid="answer-buttons-empty" className="text-sm text-neutral-500">
        No reviews in this period.
      </p>
    )
  }

  return (
    <ul data-testid="answer-buttons" className="space-y-2">
      {GRADES.map(({ grade, label }) => {
        const count = answerButtons.counts[grade]

        return (
          <li key={grade} data-testid={`answer-button-${grade}`} className="flex items-center gap-3 text-sm">
            <span className="w-12 text-neutral-600">{label}</span>
            <svg aria-hidden="true" viewBox="0 0 100 8" preserveAspectRatio="none" className="h-2 flex-1">
              <rect x={0} y={0} width={100} height={8} className="fill-neutral-100" />
              <rect x={0} y={0} width={scale(count)} height={8} className="fill-neutral-800" />
            </svg>
            <span className="w-24 text-right tabular-nums">
              {count} ({formatPercent(count / answerButtons.total)})
            </span>
          </li>
        )
      })}
    </ul>
  )
}
