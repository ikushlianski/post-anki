import { flightFor, waitForCancelled, type CancelledOutcome } from './offline-flight'
import { notifyQueuedGradesChanged } from './offline-grade-queue'
import type { OfflineReviewStore, SendGrade } from './offline-review-types'

export type QueuedUndoOutcome = CancelledOutcome | { kind: 'missing' }

export async function undoQueuedGrade(
  store: OfflineReviewStore,
  send: SendGrade,
  requestId: string,
): Promise<QueuedUndoOutcome> {
  const flight = flightFor(store)
  const sentReviewId = flight.sent.get(requestId)

  if (sentReviewId) {
    flight.sent.delete(requestId)

    return { kind: 'sent', reviewId: sentReviewId }
  }

  if (flight.inFlight === requestId) {
    flight.cancelled.add(requestId)

    return waitForCancelled(flight, requestId)
  }

  const grade = (await store.listGrades()).find((item) => item.requestId === requestId)

  if (!grade) {
    return { kind: 'missing' }
  }

  if (flight.unconfirmed.has(requestId)) {
    const result = await send(grade).catch(() => null)

    if (result?.outcome === 'confirmed') {
      await store.deleteGrade(requestId)
      flight.unconfirmed.delete(requestId)
      notifyQueuedGradesChanged()

      return { kind: 'sent', reviewId: result.reviewId }
    }

    if (result?.outcome === 'rejected') {
      await store.deleteGrade(requestId)
      flight.unconfirmed.delete(requestId)
      notifyQueuedGradesChanged()

      return { kind: 'removed' }
    }

    return { kind: 'unconfirmed' }
  }

  await store.deleteGrade(requestId)
  notifyQueuedGradesChanged()

  return { kind: 'removed' }
}
