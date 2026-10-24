import type { ModelComparisonCardGradeView } from '@post-anki/shared'

import { ModelComparisonGradePicker } from './model-comparison-grade-picker'

export interface CardGradePatch {
  rating?: number
  wordingRating?: number
}

export function ModelComparisonCardGrades({
  modelId,
  cardIndex,
  initial,
  save,
}: {
  modelId: string
  cardIndex: number
  initial: ModelComparisonCardGradeView | undefined
  save: (patch: CardGradePatch) => Promise<boolean>
}) {
  const testId = `model-comparison-card-${modelId}-${cardIndex}`

  return (
    <div className="space-y-1 pt-1">
      <ModelComparisonGradePicker
        label="Card quality"
        initial={initial?.rating ?? null}
        onSelect={(rating) => save({ rating })}
        testId={`${testId}-quality`}
      />
      <ModelComparisonGradePicker
        label="Question wording"
        initial={initial?.wordingRating ?? null}
        onSelect={(wordingRating) => save({ wordingRating })}
        testId={`${testId}-wording`}
      />
    </div>
  )
}
