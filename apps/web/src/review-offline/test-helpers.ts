import type { ReviewCard, ReviewPack } from '@post-anki/shared'

import { createMemoryOfflineStore } from './memory-offline-store'
import { createSafeOfflineStore } from './safe-offline-store'
import type { NewQueuedGrade } from './offline-grade-queue'
import type { QueuedGrade, SendResult } from './offline-review-types'

export function makeStore() {
  return createSafeOfflineStore(createMemoryOfflineStore())
}

export function makeCard(id: string, overrides: Partial<ReviewCard> = {}): ReviewCard {
  return {
    variantId: `variant-${id}`,
    knowledgeBitId: `bit-${id}`,
    kind: 'wh_question',
    prompt: `Prompt ${id}`,
    answer: `Answer ${id}`,
    background: null,
    isAiGenerated: false,
    sourceLinks: [],
    phase: 'review',
    leech: false,
    intervalPreview: { again: 60, hard: 60, good: 60, easy: 60 },
    ...overrides,
  }
}

export function makePack(cards: ReviewCard[]): ReviewPack {
  return {
    generatedAt: '2026-11-19T08:00:00.000Z',
    dueBefore: '2026-11-20T08:00:00.000Z',
    truncated: false,
    cards: cards.map((card) => ({ ...card, alternates: [] })),
  }
}

let counter = 0

export function makeGrade(overrides: Partial<NewQueuedGrade> = {}): NewQueuedGrade {
  counter += 1

  return {
    requestId: `00000000-0000-4000-8000-${String(counter).padStart(12, '0')}`,
    variantId: `variant-${counter}`,
    knowledgeBitId: `bit-${counter}`,
    grade: 'good',
    durationMs: 1200,
    tz: 'UTC',
    burySiblings: true,
    ...overrides,
  }
}

export const confirmed = { outcome: 'confirmed' as const, reviewId: 'server-review-1' }
export const retry = { outcome: 'retry' as const }
export const rejected = { outcome: 'rejected' as const }

export function fullGrade(overrides: Partial<NewQueuedGrade> = {}): QueuedGrade {
  return { ...makeGrade(overrides), reviewedAt: '2026-11-19T10:00:00.000Z', createdAt: 1, hardFailures: 0 }
}

export function deferred<T>() {
  let resolve!: (value: T) => void
  const promise = new Promise<T>((done) => {
    resolve = done
  })

  return { promise, resolve }
}

export function gatedSend() {
  const gate = deferred<SendResult>()
  const started = deferred<void>()

  return {
    send: () => {
      started.resolve()

      return gate.promise
    },
    started: started.promise,
    resolve: gate.resolve,
  }
}
