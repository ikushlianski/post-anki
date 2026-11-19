import type { ReviewCardsOutcome } from '../knowledge-bit/anki-review.api'
import { getOfflineStore } from './default-offline-store'
import { flushQueuedGrades, withoutQueuedGrades } from './offline-grade-queue'
import type { OfflineReviewStore, SendGrade } from './offline-review-types'
import { isPackFresh, packToReviewCards } from './review-pack'
import { sendQueuedGrade } from './send-queued-grade'

export type LoadedReviewCards = ReviewCardsOutcome & { savedPack?: boolean }

function isOffline(): boolean {
  return typeof navigator !== 'undefined' && navigator.onLine === false
}

function connectionLost(error: unknown): boolean {
  return isOffline() || error instanceof TypeError
}

export async function loadReviewCardsWithOfflineFallback(
  fetchOnline: () => Promise<ReviewCardsOutcome>,
  packEligible: boolean,
  store: OfflineReviewStore = getOfflineStore(),
  send: SendGrade = sendQueuedGrade,
): Promise<LoadedReviewCards> {
  if (!isOffline()) {
    await flushQueuedGrades(store, send).catch(() => undefined)
  }

  const grades = await store.listGrades()
  let failure: unknown = null
  let outcome: ReviewCardsOutcome | null = null

  try {
    outcome = await fetchOnline()

    if (outcome.ok) {
      return { ...outcome, cards: withoutQueuedGrades(outcome.cards, grades) }
    }
  } catch (error) {
    failure = error
  }

  const lost = failure !== null ? connectionLost(failure) : isOffline()

  if (packEligible && lost) {
    const stored = await store.readPack()

    if (stored && isPackFresh(stored)) {
      return { ok: true, savedPack: true, ...packToReviewCards(stored, grades) }
    }
  }

  if (failure !== null) {
    throw failure
  }

  return outcome ?? { ok: false, error: 'unknown' }
}
