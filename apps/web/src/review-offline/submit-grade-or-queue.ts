import type { ReviewGrade } from '@post-anki/shared'

import type { SubmitReviewOutcome, UndoReviewOutcome } from '../knowledge-bit/anki-review.api'
import { submitReview, undoReview } from '../knowledge-bit/anki-review.api'
import { getOfflineStore } from './default-offline-store'
import { enqueueGrade } from './offline-grade-queue'
import { undoQueuedGrade } from './offline-grade-undo'
import { noteGraded, unmarkGraded } from './pack-graded-marks'
import type { OfflineReviewStore, SendGrade } from './offline-review-types'
import { sendQueuedGrade } from './send-queued-grade'
import { generationOf, isCurrentGeneration } from './store-generation'

const OFFLINE_REVIEW_PREFIX = 'offline:'

export interface GradeSubmission {
  variantId: string
  knowledgeBitId: string
  grade: ReviewGrade
  durationMs: number
  requestId: string
  tz: string
  burySiblings: boolean
  rehearsal: boolean
}

export function isOfflineReviewId(reviewId: string): boolean {
  return reviewId.startsWith(OFFLINE_REVIEW_PREFIX)
}

function looksLikeNetworkFailure(error: unknown): boolean {
  return (typeof navigator !== 'undefined' && navigator.onLine === false) || error instanceof TypeError
}

function queuedOutcome(submission: GradeSubmission): SubmitReviewOutcome {
  return {
    ok: true,
    reviewId: `${OFFLINE_REVIEW_PREFIX}${submission.requestId}`,
    knowledgeBitId: submission.knowledgeBitId,
    phase: 'review',
    dueAt: new Date().toISOString(),
    intervalDays: 0,
    lapses: 0,
    leech: false,
    suspended: false,
    points: { awarded: 0, reason: 'not_scored', totalPoints: 0, level: 1, leveledUp: false },
    cardKey: '',
    buriedVariantIds: [],
  }
}

export async function submitGradeOrQueue(
  submission: GradeSubmission,
  store: OfflineReviewStore = getOfflineStore(),
): Promise<SubmitReviewOutcome> {
  const payload = submission
  const token = generationOf(store)

  try {
    const outcome = await submitReview({
      data: {
        variantId: payload.variantId,
        grade: payload.grade,
        durationMs: payload.durationMs,
        requestId: payload.requestId,
        tz: payload.tz,
        burySiblings: payload.burySiblings,
        ...(payload.rehearsal ? { rehearsal: true } : {}),
      },
    })

    if (outcome.ok && !submission.rehearsal) {
      await noteGraded(store, submission.variantId, submission.knowledgeBitId, Date.now(), token).catch(() => undefined)
    }

    return outcome
  } catch (error) {
    if (submission.rehearsal || !looksLikeNetworkFailure(error)) {
      return { ok: false, error: 'grading_failed' }
    }

    if (!isCurrentGeneration(store, token)) {
      return queuedOutcome(submission)
    }

    await enqueueGrade(
      store,
      {
        requestId: submission.requestId,
        variantId: submission.variantId,
        knowledgeBitId: submission.knowledgeBitId,
        grade: submission.grade,
        durationMs: submission.durationMs,
        tz: submission.tz,
        burySiblings: submission.burySiblings,
      },
      new Date(),
      token,
    )

    return queuedOutcome(submission)
  }
}

async function undoSentGrade(reviewId: string | undefined, variantId: string | undefined, store: OfflineReviewStore) {
  if (!reviewId) {
    return { ok: false, error: 'undo_unavailable' } as const
  }

  const outcome = await undoReview({ data: { reviewId } })

  if (outcome.ok && variantId) {
    await unmarkGraded(store, variantId).catch(() => undefined)
  }

  return outcome
}

export async function undoGrade(
  reviewId: string,
  variantId?: string,
  store: OfflineReviewStore = getOfflineStore(),
  send: SendGrade = sendQueuedGrade,
): Promise<UndoReviewOutcome> {
  if (!isOfflineReviewId(reviewId)) {
    const outcome = await undoReview({ data: { reviewId } })

    if (outcome.ok && variantId) {
      await unmarkGraded(store, variantId).catch(() => undefined)
    }

    return outcome
  }

  const result = await undoQueuedGrade(store, send, reviewId.slice(OFFLINE_REVIEW_PREFIX.length))

  switch (result.kind) {
    case 'removed':
      return { ok: true, knowledgeBitId: '', variantId: variantId ?? '', cardKey: '', unburiedVariantIds: [] }
    case 'sent':
      return undoSentGrade(result.reviewId, variantId, store)
    case 'unconfirmed':
      return { ok: false, error: 'undo_unconfirmed' }
    case 'missing':
      return { ok: false, error: 'review_not_found' }
  }
}
