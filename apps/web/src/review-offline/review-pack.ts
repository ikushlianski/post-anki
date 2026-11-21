import { reviewPackSchema } from '@post-anki/shared'
import type { ReviewCard, ReviewCardsResponse, ReviewPack } from '@post-anki/shared'

import { withoutQueuedGrades } from './offline-grade-queue'
import { carriedMarks, withPackLock } from './pack-graded-marks'
import { generationOf, isCurrentGeneration } from './store-generation'
import type { OfflineReviewStore, QueuedGrade, StoredPack } from './offline-review-types'

export const MAX_PACK_CARDS = 150
export const PACK_MAX_AGE_MS = 24 * 3_600_000

export function boundPack(pack: ReviewPack): ReviewPack {
  const cards = pack.cards.slice(0, MAX_PACK_CARDS)

  return { ...pack, truncated: pack.truncated || cards.length < pack.cards.length, cards }
}

export function isPackFresh(stored: StoredPack, now = Date.now()): boolean {
  const savedAt = Date.parse(stored.savedAt)

  return Number.isFinite(savedAt) && now - savedAt <= PACK_MAX_AGE_MS && savedAt <= now + 60_000
}

export function packToReviewCards(stored: StoredPack, grades: QueuedGrade[]): ReviewCardsResponse {
  const marks = stored.gradedSince
  const markedVariants = new Set(marks.map((mark) => mark.variantId))
  const markedBits = new Set(marks.map((mark) => mark.bitId))
  const unmarked = stored.pack.cards.filter(
    (card) => !markedVariants.has(card.variantId) && !markedBits.has(card.knowledgeBitId),
  )
  const cards: ReviewCard[] = withoutQueuedGrades(unmarked, grades)
  const counts = { new: 0, learning: 0, review: 0 }

  for (const card of cards) {
    if (card.phase === 'new') {
      counts.new += 1
    } else if (card.phase === 'review') {
      counts.review += 1
    } else {
      counts.learning += 1
    }
  }

  return { cards, counts, newRemainingToday: counts.new, nextDueAt: null }
}

export async function refreshStoredPack(
  store: OfflineReviewStore,
  fetchPack: () => Promise<unknown>,
  now = new Date(),
): Promise<boolean> {
  const token = generationOf(store)

  try {
    const parsed = reviewPackSchema.safeParse(await fetchPack())

    if (!parsed.success) {
      return false
    }

    const pack = boundPack(parsed.data)

    return await withPackLock(store, async () => {
      const gradedSince = carriedMarks(await store.readPack(), now.getTime())

      if (!isCurrentGeneration(store, token)) {
        return false
      }

      return store.writePack({ savedAt: now.toISOString(), pack, gradedSince })
    })
  } catch {
    return false
  }
}
