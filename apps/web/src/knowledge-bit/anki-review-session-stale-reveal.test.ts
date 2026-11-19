import { describe, expect, it } from 'vitest'

import { ankiReviewSessionReducer, initialAnkiReviewSession } from './anki-review-session'

describe('stale reveal after a sibling is hidden', () => {
  const card = (id: string) => ({ variantId: id, knowledgeBitId: `bit-${id}` }) as never

  it('should show the next card unrevealed when confirmation hides the sibling that replaced the graded card', () => {
    const state = { ...initialAnkiReviewSession(1), front: [card('b'), card('c')], revealed: true, shownAt: 1 }
    const next = ankiReviewSessionReducer(state, {
      type: 'gradeConfirmed',
      pendingId: 'pending:x',
      now: 50,
      confirmed: {
        reviewId: 'r',
        leechSuspended: false,
        points: { awarded: 0, leveledUp: false, level: 0 },
        hide: ['b'],
        followUp: null,
      },
    })

    expect(next.front.map((c) => c.variantId)).toEqual(['c'])
    expect(next).toMatchObject({ revealed: false, shownAt: 50 })
  })

  it('should keep the answer revealed when the confirmation hides a card that is not on screen', () => {
    const state = { ...initialAnkiReviewSession(1), front: [card('b'), card('c')], revealed: true, shownAt: 1 }
    const next = ankiReviewSessionReducer(state, {
      type: 'gradeConfirmed',
      pendingId: 'pending:x',
      now: 50,
      confirmed: {
        reviewId: 'r',
        leechSuspended: false,
        points: { awarded: 0, leveledUp: false, level: 0 },
        hide: ['c'],
        followUp: null,
      },
    })

    expect(next).toMatchObject({ revealed: true, shownAt: 1 })
  })

  it('should clear a stale reveal when the guard reports the card changed under it', () => {
    const state = { ...initialAnkiReviewSession(1), revealed: true }

    expect(ankiReviewSessionReducer(state, { type: 'staleRevealCleared', now: 9 })).toMatchObject({ revealed: false, shownAt: 9 })
  })
})
