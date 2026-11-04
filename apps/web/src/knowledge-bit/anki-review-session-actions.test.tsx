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

const savedOutcome = {
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

function renderActions(burySiblings?: boolean, dispatch = vi.fn()) {
  return renderHook(() =>
    useAnkiReviewSessionActions({
      state: initialAnkiReviewSession(Date.now()),
      dispatch,
      burySiblings,
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

  it('should send the browser time zone and bury siblings by default', async () => {
    mockedSubmit.mockResolvedValue(savedOutcome)

    const { result } = renderActions()

    await act(() => result.current.grade('good'))

    expect(mockedSubmit.mock.calls[0]?.[0].data).toMatchObject({
      tz: expect.any(String),
      burySiblings: true,
    })
  })

  it('should keep every gap visible when the session is scoped to a single note', async () => {
    mockedSubmit.mockResolvedValue(savedOutcome)

    const { result } = renderActions(false)

    await act(() => result.current.grade('good'))

    expect(mockedSubmit.mock.calls[0]?.[0].data.burySiblings).toBe(false)
  })

  it('should hide the sibling cards the server buried after a grade', async () => {
    mockedSubmit.mockResolvedValue({ ...savedOutcome, buriedVariantIds: ['variant-2'] })

    const dispatch = vi.fn()
    const { result } = renderActions(true, dispatch)

    await act(() => result.current.grade('good'))

    expect(dispatch).toHaveBeenCalledWith(expect.objectContaining({ type: 'acted', hide: ['variant-2'] }))
  })
})

describe('useAnkiReviewSessionActions rehearsal', () => {
  const followUp: ReviewCard = { ...card, variantId: 'variant-2', prompt: 'Why do TCP peers shake hands?' }

  beforeEach(() => {
    mockedSubmit.mockReset()
  })

  afterEach(() => {
    cleanup()
  })

  it('should pass the follow-up wording to the session when a normal grade returns one', async () => {
    mockedSubmit.mockResolvedValueOnce({ ...savedOutcome, followUp })

    const dispatch = vi.fn()
    const { result } = renderActions(undefined, dispatch)

    await act(async () => {
      await result.current.grade('good')
    })

    expect(dispatch).toHaveBeenCalledWith(expect.objectContaining({ type: 'acted', followUp }))
  })

  it('should send the rehearsal flag, leave undo and counts alone, and ignore any follow-up for a rehearsal grade', async () => {
    mockedSubmit.mockResolvedValueOnce({ ...savedOutcome, followUp })

    const dispatch = vi.fn()
    const state = { ...initialAnkiReviewSession(Date.now()), front: [followUp], rehearsal: true }
    const { result } = renderHook(() =>
      useAnkiReviewSessionActions({
        state,
        dispatch,
        current: followUp,
        batchSize: 10,
        stamp: 1,
        refill: vi.fn().mockResolvedValue(undefined),
      }),
    )

    await act(async () => {
      await result.current.grade('good')
    })

    expect(mockedSubmit.mock.calls[0]?.[0].data).toMatchObject({ variantId: 'variant-2', grade: 'good', rehearsal: true })
    expect(dispatch).toHaveBeenCalledTimes(1)
    expect(dispatch).toHaveBeenCalledWith(expect.objectContaining({ type: 'advance' }))
  })

  it('should not send the rehearsal flag for an ordinary grade', async () => {
    mockedSubmit.mockResolvedValueOnce(savedOutcome)

    const { result } = renderActions()

    await act(async () => {
      await result.current.grade('good')
    })

    expect(mockedSubmit.mock.calls[0]?.[0].data).not.toHaveProperty('rehearsal')
  })
})
