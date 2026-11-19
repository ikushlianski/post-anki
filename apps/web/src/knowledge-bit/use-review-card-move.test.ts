// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, renderHook } from '@testing-library/react'
import type { ReviewCard } from '@post-anki/shared'

import { moveKnowledgeBitToSubjectForReview } from './knowledge-bit-subject-move.api'
import { loadRecentMoveTargets } from './recent-move-targets'
import { MOVE_OFFLINE_MESSAGE, useReviewCardMove } from './use-review-card-move'

vi.mock('./knowledge-bit-subject-move.api', () => ({ moveKnowledgeBitToSubjectForReview: vi.fn() }))

const mockedMove = vi.mocked(moveKnowledgeBitToSubjectForReview)

const card: ReviewCard = {
  variantId: 'variant-1',
  knowledgeBitId: 'bit-1',
  kind: 'wh_question',
  prompt: 'Why?',
  answer: 'Because.',
  background: null,
  isAiGenerated: false,
  sourceLinks: [],
  phase: 'review',
  leech: false,
  intervalPreview: { again: 60, hard: 60, good: 60, easy: 60 },
}

afterEach(() => {
  cleanup()
  localStorage.clear()
  vi.clearAllMocks()
})

function setup(online = true) {
  const advance = vi.fn()
  const rollback = vi.fn()
  const advanceWith = vi.fn(async (notice: string, save: () => Promise<boolean>) => {
    advance(notice)

    const saved = await save()

    if (!saved) {
      rollback()
    }

    return saved
  })
  const hook = renderHook(() => useReviewCardMove({ current: card, online, advanceWith }))

  return { advance, rollback, hook }
}

describe('useReviewCardMove', () => {
  it('should move the card, remember the deck and continue to the next card with a confirmation', async () => {
    mockedMove.mockResolvedValue({ moved: ['bit-1'], skipped: [] })

    const { advance, rollback, hook } = setup()

    await act(() => hook.result.current.move('s1', 'English / Words'))

    expect(mockedMove).toHaveBeenCalledWith({ data: { bitId: 'bit-1', subjectId: 's1' } })
    expect(advance).toHaveBeenCalledWith('Moved to English / Words')
    expect(rollback).not.toHaveBeenCalled()
    expect(loadRecentMoveTargets()).toEqual(['s1'])
  })

  it('should show the next card before the server answers the move', async () => {
    let finish: (value: { moved: string[]; skipped: [] }) => void = () => undefined

    mockedMove.mockReturnValue(new Promise((resolve) => (finish = resolve)))

    const { advance, hook } = setup()
    let pending: Promise<boolean> = Promise.resolve(false)

    act(() => {
      pending = hook.result.current.move('s1', 'English')
    })

    expect(advance).toHaveBeenCalledWith('Moved to English')

    await act(async () => {
      finish({ moved: ['bit-1'], skipped: [] })
      await pending
    })
  })

  it('should send the move only once when the learner double-clicks a deck', async () => {
    mockedMove.mockResolvedValue({ moved: ['bit-1'], skipped: [] })

    const { hook } = setup()

    await act(async () => {
      await Promise.all([hook.result.current.move('s1', 'English'), hook.result.current.move('s1', 'English')])
    })

    expect(mockedMove).toHaveBeenCalledTimes(1)
  })

  it('should not send anything and ask for a connection when offline', async () => {
    const { advance, hook } = setup(false)

    await act(() => hook.result.current.move('s1', 'English'))

    expect(mockedMove).not.toHaveBeenCalled()
    expect(advance).not.toHaveBeenCalled()
    expect(hook.result.current.moveError).toBe(MOVE_OFFLINE_MESSAGE)
  })

  it('should put the card back and explain when a course card cannot move', async () => {
    mockedMove.mockResolvedValue({ moved: [], skipped: [{ id: 'bit-1', reason: 'curriculum_placed' }] })

    const { rollback, hook } = setup()

    await act(() => hook.result.current.move('s1', 'English'))

    expect(rollback).toHaveBeenCalledTimes(1)
    expect(hook.result.current.moveError).toMatch(/course/)
    expect(loadRecentMoveTargets()).toEqual([])
  })

  it('should put the card back with a plain message when the request fails', async () => {
    mockedMove.mockRejectedValue(new Error('down'))

    const { rollback, hook } = setup()

    await act(() => hook.result.current.move('s1', 'English'))

    expect(rollback).toHaveBeenCalledTimes(1)
    expect(hook.result.current.moveError).toBe("Couldn't move the card. Try again.")
  })
})
