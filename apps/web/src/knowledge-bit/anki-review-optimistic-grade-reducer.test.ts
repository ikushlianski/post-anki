import { describe, expect, it } from 'vitest'
import type { ReviewCard } from '@post-anki/shared'

import { ankiReviewSessionReducer, initialAnkiReviewSession } from './anki-review-session'
import { optimisticGradeAction, pendingReviewId } from './anki-review-optimistic-grade'

function makeCard(id: string): ReviewCard {
  return {
    variantId: id,
    knowledgeBitId: `bit-${id}`,
    kind: 'wh_question',
    prompt: id,
    answer: id,
    background: null,
    isAiGenerated: false,
    sourceLinks: [],
    phase: 'review',
    leech: false,
    intervalPreview: { again: 60, hard: 60, good: 60, easy: 60 },
  }
}

const confirmed = {
  reviewId: 'review-1',
  leechSuspended: false,
  points: { awarded: 3, leveledUp: false, level: 1 },
  hide: [],
  followUp: null,
}

function graded() {
  const before = { ...initialAnkiReviewSession(0), front: [makeCard('a'), makeCard('b')], revealed: true }
  const action = optimisticGradeAction({
    rehearsal: false,
    requestId: 'r1',
    card: makeCard('a'),
    grade: 'good',
    durationMs: 1000,
    stamp: 1,
    now: 5,
  })

  return { before, after: ankiReviewSessionReducer(before, action) }
}

describe('optimistic grade reducer', () => {
  it('should advance and tally the card the moment it is graded', () => {
    const { after } = graded()

    expect(after.front.map((c) => c.variantId)).toEqual(['b'])
    expect(after.tally).toEqual({ stamp: 1, new: 0, review: 1 })
    expect(after.undo).toHaveLength(1)
  })

  it('should keep the tally at one when the server confirms', () => {
    const { after } = graded()
    const done = ankiReviewSessionReducer(after, {
      type: 'gradeConfirmed',
      pendingId: pendingReviewId('r1'),
      confirmed,
      now: 6,
    })

    expect(done.tally).toEqual({ stamp: 1, new: 0, review: 1 })
    expect(done.undo).toHaveLength(1)
    expect(done.undo[0]).toMatchObject({ reviewId: 'review-1', points: { awarded: 3 } })
  })

  it('should restore the card, tally and undo list when the save is rejected', () => {
    const { before, after } = graded()

    expect(ankiReviewSessionReducer(after, { type: 'gradeRolledBack', snapshot: before })).toEqual(before)
  })
})
