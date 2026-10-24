import { useRef } from 'react'
import type { PendingKnowledgeSourceForReview } from '@post-anki/shared'

import {
  gradeKnowledgeBitForReview,
  updateKnowledgeBitFeedbackForReview,
} from './knowledge-bit-review.api'
import { useRejectionWhy } from './knowledge-bit-review-why'
import type { ReviewDecisions } from './use-review-decisions'

export function useReviewGrading({
  sources,
  decisions,
}: {
  sources: PendingKnowledgeSourceForReview[]
  decisions: ReviewDecisions
}) {
  const gradedFeedbackIds = useRef<Record<string, string>>({})

  const why = useRejectionWhy({
    updateFeedback: async (feedbackId, data) => {
      try {
        await updateKnowledgeBitFeedbackForReview({ data: { feedbackId, ...data } })

        return true
      } catch {
        return false
      }
    },
    grade: async (bitId, data) => {
      try {
        const result = await gradeKnowledgeBitForReview({ data: { bitId, ...data } })

        gradedFeedbackIds.current[bitId] = result.feedbackId

        return result.feedbackId
      } catch {
        return null
      }
    },
  })

  function openGrade(bitId: string) {
    const decision = decisions[bitId]
    const recorded = sources
      .flatMap((source) => source.bits)
      .find((bit) => bit.id === bitId)?.feedback
    const feedbackId =
      decision?.feedbackId ?? gradedFeedbackIds.current[bitId] ?? recorded?.feedbackId ?? null
    const verdict = decision?.verdict ?? recorded?.verdict

    why.show({
      bitId,
      feedbackId,
      mode: verdict === 'rejected' && feedbackId ? 'rejected' : 'grade',
    })
  }

  return { why, openGrade }
}
