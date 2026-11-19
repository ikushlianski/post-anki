import type { ReviewCard, ReviewGrade } from '@post-anki/shared'

import type { SubmitReviewOutcome } from './anki-review.api'

import type { AnkiReviewSessionAction, AnkiReviewSessionState, SessionUndoEntry } from './anki-review-session'

export const GRADE_SAVE_FAILED_MESSAGE = "Couldn't save that grade. Try again."
const LEECH_NOTICE =
  'This card was forgotten again and suspended as a leech. Consider rewriting it.'

export const PENDING_REVIEW_PREFIX = 'pending:'

export function isBatchExhausted(state: AnkiReviewSessionState, batchSize: number, hasFollowUp: boolean): boolean {
  const nextIndex = state.front.length > 0 ? state.index : state.index + 1

  return !hasFollowUp && state.front.length <= 1 && nextIndex >= batchSize
}

export function pendingReviewId(requestId: string): string {
  return `${PENDING_REVIEW_PREFIX}${requestId}`
}

export function optimisticGradeAction(input: {
  rehearsal: boolean
  requestId: string
  card: ReviewCard
  grade: ReviewGrade
  durationMs: number
  stamp: number
  now: number
}): AnkiReviewSessionAction {
  if (input.rehearsal) {
    return { type: 'advance', now: input.now }
  }

  const entry: SessionUndoEntry = {
    kind: 'grade',
    reviewId: pendingReviewId(input.requestId),
    card: input.card,
    grade: input.grade,
    durationMs: input.durationMs,
    leechSuspended: false,
    points: { awarded: 0, leveledUp: false, level: 0 },
    stamp: input.stamp,
  }

  return { type: 'acted', entry, now: input.now }
}

export function confirmedGradeAction(
  requestId: string,
  outcome: Extract<SubmitReviewOutcome, { ok: true }>,
): AnkiReviewSessionAction {
  const leechSuspended = outcome.leech && outcome.suspended

  return {
    type: 'gradeConfirmed',
    pendingId: pendingReviewId(requestId),
    now: Date.now(),
    confirmed: {
      reviewId: outcome.reviewId,
      leechSuspended,
      points: {
        awarded: outcome.points.awarded,
        leveledUp: outcome.points.leveledUp,
        level: outcome.points.level,
      },
      hide: outcome.buriedVariantIds,
      followUp: outcome.followUp ?? null,
      notice: leechSuspended ? LEECH_NOTICE : undefined,
    },
  }
}
