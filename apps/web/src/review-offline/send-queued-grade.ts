import type { QueuedGrade, SendResult } from './offline-review-types'
import { fetchReviewPack, syncQueuedGrade } from './review-offline.api'

function connectionLost(error: unknown): boolean {
  return (typeof navigator !== 'undefined' && navigator.onLine === false) || error instanceof TypeError
}

export async function sendQueuedGrade(grade: QueuedGrade): Promise<SendResult> {
  try {
    return await syncQueuedGrade({
      data: {
        variantId: grade.variantId,
        grade: grade.grade,
        durationMs: grade.durationMs,
        requestId: grade.requestId,
        tz: grade.tz,
        burySiblings: grade.burySiblings,
        reviewedAt: grade.reviewedAt,
      },
    })
  } catch (error) {
    if (connectionLost(error)) {
      return { outcome: 'retry' }
    }

    throw error
  }
}

export async function downloadReviewPack(tz: string): Promise<unknown> {
  const result = await fetchReviewPack({ data: { tz } })

  if (!result.ok) {
    throw new Error('pack_unavailable')
  }

  return result.pack
}
