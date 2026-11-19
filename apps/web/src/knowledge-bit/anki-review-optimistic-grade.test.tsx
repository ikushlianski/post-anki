// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, renderHook, act } from '@testing-library/react'
import type { ReviewCard } from '@post-anki/shared'

import { initialAnkiReviewSession } from './anki-review-session'
import { submitReview } from './anki-review.api'
import { useAnkiReviewSessionActions } from './anki-review-session-actions'

vi.mock('./anki-review.api', () => ({
  submitReview: vi.fn(),
  undoReview: vi.fn(),
  updateCardSchedule: vi.fn(),
  editReviewCard: vi.fn(),
}))

const mockedSubmit = vi.mocked(submitReview)

const card: ReviewCard = {
  variantId: 'variant-1',
  knowledgeBitId: 'bit-1',
  kind: 'wh_question',
  prompt: 'Why a handshake?',
  answer: 'To agree on sequence numbers.',
  background: null,
  isAiGenerated: false,
  sourceLinks: [],
  phase: 'review',
  leech: false,
  intervalPreview: { again: 60, hard: 60, good: 60, easy: 60 },
}

const saved = {
  ok: true as const,
  reviewId: 'review-1',
  cardKey: '',
  buriedVariantIds: [],
  knowledgeBitId: 'bit-1',
  phase: 'review' as const,
  dueAt: '2026-10-20T00:00:00.000Z',
  intervalDays: 6,
  lapses: 0,
  leech: false,
  suspended: false,
  points: { awarded: 3, reason: 'awarded' as const, totalPoints: 3, level: 1, leveledUp: false },
}

function setup(dispatch = vi.fn()) {
  const state = initialAnkiReviewSession(Date.now())
  const hook = renderHook(() =>
    useAnkiReviewSessionActions({
      state,
      dispatch,
      current: card,
      batchSize: 10,
      stamp: 1,
      refill: vi.fn().mockResolvedValue(undefined),
    }),
  )

  return { ...hook, dispatch, state }
}

describe('optimistic grading', () => {
  beforeEach(() => {
    mockedSubmit.mockReset()
  })

  afterEach(() => {
    cleanup()
  })

  it('should move to the next card and count the grade before the server answers', async () => {
    let release: (value: typeof saved) => void = () => undefined

    mockedSubmit.mockReturnValueOnce(new Promise((resolve) => (release = resolve)))

    const { result, dispatch } = setup()
    let pending: Promise<void> = Promise.resolve()

    act(() => {
      pending = result.current.grade('good')
    })

    expect(dispatch).toHaveBeenCalledTimes(1)
    expect(dispatch).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'acted', entry: expect.objectContaining({ kind: 'grade', grade: 'good' }) }),
    )

    await act(async () => {
      release(saved)
      await pending
    })
  })

  it('should replace the guessed values with the server values once saved, counting the grade once', async () => {
    mockedSubmit.mockResolvedValueOnce(saved)

    const { result, dispatch } = setup()

    await act(() => result.current.grade('good'))

    const types = dispatch.mock.calls.map(([action]) => action.type)

    expect(types).toEqual(['acted', 'gradeConfirmed'])
    expect(dispatch.mock.calls[1]?.[0]).toMatchObject({
      confirmed: { reviewId: 'review-1', points: { awarded: 3 } },
    })
  })

  it('should put the card back with a plain message when the server rejects the grade', async () => {
    mockedSubmit.mockResolvedValueOnce({ ok: false, error: 'grading_failed' })

    const { result, dispatch, state } = setup()

    await act(() => result.current.grade('good'))

    expect(dispatch).toHaveBeenLastCalledWith({ type: 'gradeRolledBack', snapshot: state })
    expect(result.current.error).toBe('grading_failed')
    expect(result.current.canRetryGrade).toBe(true)
  })
})
