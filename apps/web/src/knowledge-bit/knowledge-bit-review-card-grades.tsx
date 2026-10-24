import { useState } from 'react'
import type { KnowledgeBitFeedbackSummary } from '@post-anki/shared'

import { GradeControl } from './knowledge-bit-grade-control'

export interface CardGradePatch {
  rating?: number
  wordingRating?: number
}

export function KnowledgeBitReviewCardGrades({
  bitId,
  feedback,
  onSave,
}: {
  bitId: string
  feedback: KnowledgeBitFeedbackSummary | null | undefined
  onSave: (patch: CardGradePatch) => Promise<boolean>
}) {
  const [rating, setRating] = useState<number | null>(feedback?.rating ?? null)
  const [wording, setWording] = useState<number | null>(feedback?.wordingRating ?? null)
  const [error, setError] = useState<string | null>(null)

  async function save(patch: CardGradePatch) {
    setError(null)

    const saved = await onSave(patch)

    if (!saved) {
      setError("Couldn't save the grade. Pick it again to retry.")
    }
  }

  return (
    <div className="space-y-1.5">
      <GradeControl
        label="Card quality"
        value={rating}
        testId={`knowledge-bit-review-card-quality-${bitId}`}
        onChange={(grade) => {
          setRating(grade)
          void save({ rating: grade })
        }}
      />
      <GradeControl
        label="Question wording"
        value={wording}
        testId={`knowledge-bit-review-question-wording-${bitId}`}
        onChange={(grade) => {
          setWording(grade)
          void save({ wordingRating: grade })
        }}
      />
      {error ? (
        <p role="alert" data-testid={`knowledge-bit-review-grade-error-${bitId}`} className="text-xs text-red-600">
          {error}
        </p>
      ) : null}
    </div>
  )
}
