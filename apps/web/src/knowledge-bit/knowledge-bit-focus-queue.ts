import type {
  PendingKnowledgeBitForReview,
  PendingKnowledgeSourceForReview,
} from '@post-anki/shared'

export interface FocusQueue {
  current: { bit: PendingKnowledgeBitForReview; source: PendingKnowledgeSourceForReview } | null
  readyCount: number
  waitingCount: number
}

export function buildFocusQueue(pendingSources: PendingKnowledgeSourceForReview[]): FocusQueue {
  let current: FocusQueue['current'] = null
  let readyCount = 0
  let waitingCount = 0

  for (const source of pendingSources) {
    for (const bit of source.bits) {
      if (bit.variants.length === 0) {
        waitingCount += 1

        continue
      }

      readyCount += 1
      current ??= { bit, source }
    }
  }

  return { current, readyCount, waitingCount }
}
