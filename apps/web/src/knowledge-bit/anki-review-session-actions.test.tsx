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
  phase: 'review',
  leech: false,
  intervalPreview: { again: 60, hard: 60, good: 60, easy: 60 },
}

const savedOutcome = {
  ok: true as const,
  reviewId: 'review-1',
  knowledgeBitId: 'bit-1',
  phase: 'review' as const,
  dueAt: '2026-10-20T00:00:00.000Z',
  intervalDays: 6,
  lapses: 0,
  leech: false,
  suspended: false,
}

function renderActions() {
  return renderHook(() =>
    useAnkiReviewSessionActions({
      state: initialAnkiReviewSession(Date.now()),
      dispatch: vi.fn(),
      current: card,
      batchSize: 10,
      stamp: 1,
      refill: vi.fn().mockResolvedValue(undefined),
    }),
  )
}

function sentRequestIds(): (string | undefined)[] {
  return mockedSubmit.mock.calls.map(([args]) => args.data.requestId)
}

describe('useAnkiReviewSessionActions grading', () => {
  beforeEach(() => {
    mockedSubmit.mockReset()
  })

  afterEach(() => {
    cleanup()
  })

  it('should reuse the same requestId when the learner retries a grade whose response was lost', async () => {
    mockedSubmit
      .mockRejectedValueOnce(new Error('connection reset'))
      .mockResolvedValueOnce(savedOutcome)

    const { result } = renderActions()

    await act(() => result.current.grade('good'))
    await act(() => result.current.grade('good'))

    const [first, second] = sentRequestIds()

    expect(first).toEqual(expect.any(String))
    expect(second).toBe(first)
  })

  it('should send a fresh requestId for the next grade once a grade has been saved', async () => {
    mockedSubmit.mockResolvedValue(savedOutcome)

    const { result } = renderActions()

    await act(() => result.current.grade('good'))
    await act(() => result.current.grade('good'))

    const [first, second] = sentRequestIds()

    expect(first).toEqual(expect.any(String))
    expect(second).not.toBe(first)
  })
})
