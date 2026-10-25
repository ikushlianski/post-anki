import {
  gradeKnowledgeBitForReview,
  updateKnowledgeBitFeedbackForReview,
} from './knowledge-bit-review.api'

const NEUTRAL_RATING = 3

export async function sendDecisionNote(
  action: 'approve' | 'reject',
  bitId: string,
  text: string,
  feedbackId: string | null,
  onError: () => void,
) {
  try {
    if (action === 'reject' && feedbackId) {
      await updateKnowledgeBitFeedbackForReview({ data: { feedbackId, note: text } })
    } else if (action === 'approve') {
      await gradeKnowledgeBitForReview({ data: { bitId, rating: NEUTRAL_RATING, note: text } })
    }
  } catch {
    onError()
  }
}
