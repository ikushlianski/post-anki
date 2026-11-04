import { describe, expect, it } from 'vitest'
import type { ReviewCard, ReviewCounts } from '@post-anki/shared'

import { isScoped, stopWhenNothingDue } from './anki-review-queue'

const card = { variantId: 'v1' } as ReviewCard
const zero: ReviewCounts = { new: 0, learning: 0, review: 0 } as ReviewCounts

describe('stopWhenNothingDue', () => {
  it('should end a scoped session that has nothing due but a later due date', () => {
    const response = { cards: [card], counts: zero, nextDueAt: '2026-11-05T09:00:00Z' }

    expect(stopWhenNothingDue(response, true).cards).toEqual([])
  })

  it('should keep cards when the learner chose to study ahead', () => {
    const response = { cards: [card], counts: zero, nextDueAt: '2026-11-05T09:00:00Z' }

    expect(stopWhenNothingDue(response, false).cards).toEqual([card])
  })

  it('should keep cards while something is still due', () => {
    const response = { cards: [card], counts: { ...zero, review: 2 }, nextDueAt: '2026-11-05T09:00:00Z' }

    expect(stopWhenNothingDue(response, true).cards).toEqual([card])
  })

  it('should keep cards when no future due date exists', () => {
    expect(stopWhenNothingDue({ cards: [card], counts: zero, nextDueAt: null }, true).cards).toEqual([card])
  })
})

describe('isScoped', () => {
  it('should treat a subject review as scoped and the global review as unscoped', () => {
    expect(isScoped({ subjectId: 's1' })).toBe(true)
    expect(isScoped({})).toBe(false)
  })
})
