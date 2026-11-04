import type { ReviewCard, ReviewCounts } from '@post-anki/shared'

import type { SessionTally } from './anki-review-session'

export interface AnkiReviewScope {
  tagId?: string
  topicId?: string
  knowledgeBitId?: string
  subjectId?: string
}

export function remainingCounts(server: ReviewCounts, tally: SessionTally | null, stamp: number) {
  const graded = tally && tally.stamp === stamp ? tally : { new: 0, review: 0 }

  return {
    ...server,
    new: Math.max(0, server.new - graded.new),
    review: Math.max(0, server.review - graded.review),
  }
}

export function reviewQueueQueryKey(scope: AnkiReviewScope) {
  return [
    'anki-review-queue',
    scope.tagId ?? null,
    scope.topicId ?? null,
    scope.knowledgeBitId ?? null,
    scope.subjectId ?? null,
  ] as const
}

export function isScoped(scope: AnkiReviewScope): boolean {
  return Object.values(scope).some((value) => value !== undefined)
}

export function stopWhenNothingDue<T extends { cards: ReviewCard[]; counts: ReviewCounts; nextDueAt: string | null }>(
  response: T,
  stop: boolean,
): T {
  const { counts } = response
  const nothingDue = counts.new + counts.learning + counts.review === 0

  return stop && nothingDue && response.nextDueAt !== null ? { ...response, cards: [] } : response
}
