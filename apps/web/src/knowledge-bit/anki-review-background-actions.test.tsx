// @vitest-environment jsdom
import { useReducer } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, renderHook } from '@testing-library/react'
import type { ReviewCard } from '@post-anki/shared'

import { ankiReviewSessionReducer, initialAnkiReviewSession } from './anki-review-session'
import { editReviewCard, updateCardSchedule } from './anki-review.api'
import { useAnkiReviewSessionActions } from './anki-review-session-actions'
import { submitGradeOrQueue } from '../review-offline/submit-grade-or-queue'

vi.mock('./anki-review.api', () => ({
  submitReview: vi.fn(),
  undoReview: vi.fn(),
  updateCardSchedule: vi.fn(),
  editReviewCard: vi.fn(),
}))
vi.mock('../review-offline/submit-grade-or-queue', () => ({ submitGradeOrQueue: vi.fn(), undoGrade: vi.fn() }))

const mockedSchedule = vi.mocked(updateCardSchedule)
const mockedEdit = vi.mocked(editReviewCard)
const mockedGrade = vi.mocked(submitGradeOrQueue)

function makeCard(id: string): ReviewCard {
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
  }
}

const first = makeCard('1')
const second = makeCard('2')

function harness(batchSize = 10) {
  const refill = vi.fn().mockResolvedValue(undefined)

  return {
    refill,
    ...renderHook(() => {
      const [state, dispatch] = useReducer(ankiReviewSessionReducer, {
        ...initialAnkiReviewSession(1),
        front: [first, second],
        editingSince: null,
      })
      const current = state.front[0] ?? null
      const actions = useAnkiReviewSessionActions({ state, dispatch, current, batchSize, stamp: 1, refill })

      return { state, actions, current }
    }),
  }
}

function deferred<T>() {
  let resolve: (value: T) => void = () => undefined

  const promise = new Promise<T>((done) => (resolve = done))

  return { promise, resolve }
}

beforeEach(() => {
  vi.resetAllMocks()
})

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
})

describe.each([
  ['bury', { buried: true }],
  ['suspend', { suspended: true }],
] as const)('review %s in the background', (kind, flag) => {
  it(`should show the next card before the server confirms the ${kind}`, async () => {
    const save = deferred<{ ok: true }>()

    mockedSchedule.mockReturnValue(save.promise as never)

    const { result } = harness()
    let pending: Promise<void> = Promise.resolve()

    act(() => {
      pending = result.current.actions.control(kind)
    })

    expect(result.current.current?.variantId).toBe('variant-2')
    expect(mockedSchedule.mock.calls[0]?.[0].data).toMatchObject(flag)

    await act(async () => {
      save.resolve({ ok: true })
      await pending
    })

    expect(result.current.current?.variantId).toBe('variant-2')
    expect(result.current.actions.error).toBeNull()
  })

  it(`should bring the card back with a message when the ${kind} cannot be saved`, async () => {
    mockedSchedule.mockResolvedValue({ ok: false, error: 'control_failed' } as never)

    const { result } = harness()

    await act(() => result.current.actions.control(kind))

    expect(result.current.current?.variantId).toBe('variant-1')
    expect(result.current.state.undo).toEqual([])
    expect(result.current.actions.error).toBe('control_failed')
  })

  it(`should bring the card back when the ${kind} request throws`, async () => {
    mockedSchedule.mockRejectedValue(new Error('down'))

    const { result } = harness()

    await act(() => result.current.actions.control(kind))

    expect(result.current.current?.variantId).toBe('variant-1')
    expect(result.current.actions.error).toBe('control_failed')
  })

  it(`should keep the card on screen without a flash when the ${kind} is tried offline`, async () => {
    vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(false)

    const { result } = harness()

    await act(() => result.current.actions.control(kind))

    expect(result.current.current?.variantId).toBe('variant-1')
    expect(result.current.state.undo).toEqual([])
    expect(result.current.actions.error).toBe('control_failed')
    expect(mockedSchedule).not.toHaveBeenCalled()
  })

  it(`should send the ${kind} only once when triggered twice quickly`, async () => {
    const save = deferred<{ ok: true }>()

    mockedSchedule.mockReturnValue(save.promise as never)

    const { result } = harness()
    let pending: Promise<void> = Promise.resolve()

    act(() => {
      pending = Promise.all([result.current.actions.control(kind), result.current.actions.control(kind)]).then(() => undefined)
    })

    await act(async () => {
      save.resolve({ ok: true })
      await pending
    })

    expect(mockedSchedule).toHaveBeenCalledTimes(1)
  })
})

describe('review move in the background', () => {
  it('should hide the refilling spinner and restore the card when the last card of a batch fails to move', async () => {
    const { result } = harness(1)
    let moved = true

    await act(async () => {
      moved = await result.current.actions.advanceWith('Moved', async () => false)
    })

    expect(moved).toBe(false)
    expect(result.current.actions.refilling).toBe(false)
    expect(result.current.current?.variantId).toBe('variant-1')
    expect(result.current.state.notice).toBeNull()
  })

  it('should advance with the notice before the move is confirmed', async () => {
    const save = deferred<boolean>()
    const { result } = harness()
    let pending: Promise<boolean> = Promise.resolve(false)

    act(() => {
      pending = result.current.actions.advanceWith('Moved to Deck', () => save.promise)
    })

    expect(result.current.current?.variantId).toBe('variant-2')
    expect(result.current.state.notice).toBe('Moved to Deck')

    await act(async () => {
      save.resolve(true)
      await pending
    })
  })
})

describe('review edit in the background', () => {
  it('should show the edited wording at once and keep it after the server confirms', async () => {
    const save = deferred<{ ok: true; variantId: string; prompt: string; answer: string }>()

    mockedEdit.mockReturnValue(save.promise as never)

    const { result } = harness()
    let pending: Promise<void> = Promise.resolve()

    act(() => {
      result.current.actions.setEditError(null)
      pending = result.current.actions.saveEdit('New prompt', 'New answer')
    })

    expect(result.current.state.edits['bit-1']).toMatchObject({ prompt: 'New prompt', answer: 'New answer' })

    await act(async () => {
      save.resolve({ ok: true, variantId: 'variant-1b', prompt: 'New prompt', answer: 'New answer' })
      await pending
    })

    expect(result.current.state.edits['bit-1']?.variantId).toBe('variant-1b')
    expect(result.current.actions.editError).toBeNull()
  })

  it('should undo the edit, explain, and hand back the typed text when saving fails', async () => {
    mockedEdit.mockResolvedValue({ ok: false, error: 'edit_failed' } as never)

    const { result } = harness()

    await act(() => result.current.actions.saveEdit('New prompt', 'New answer'))

    expect(result.current.state.edits).toEqual({})
    expect(result.current.actions.editError).toBe("Couldn't save the edit. Try again.")
    expect(result.current.actions.editDraft).toMatchObject({ prompt: 'New prompt', answer: 'New answer' })
  })

  it('should send the edit only once when saved twice quickly', async () => {
    const save = deferred<{ ok: true; variantId: string }>()

    mockedEdit.mockReturnValue(save.promise as never)

    const { result } = harness()
    let pending: Promise<unknown> = Promise.resolve()

    act(() => {
      pending = Promise.all([result.current.actions.saveEdit('A', 'B'), result.current.actions.saveEdit('A', 'B')])
    })

    await act(async () => {
      save.resolve({ ok: true, variantId: 'variant-1b' })
      await pending
    })

    expect(mockedEdit).toHaveBeenCalledTimes(1)
  })
})

describe('review grade that throws unexpectedly', () => {
  it('should roll the grade back with the plain message, offer a retry and stop refilling', async () => {
    mockedGrade.mockRejectedValue(new Error('boom'))

    const { result, refill } = harness(1)

    await act(() => result.current.actions.grade('good'))

    expect(result.current.current?.variantId).toBe('variant-1')
    expect(result.current.state.undo).toEqual([])
    expect(result.current.actions.refilling).toBe(false)
    expect(result.current.actions.canRetryGrade).toBe(true)
    expect(result.current.actions.error).toBe('grade_save_failed')
    expect(refill).not.toHaveBeenCalled()
  })
})
