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
  const advance = vi.fn().mockResolvedValue(undefined)
  const hook = renderHook(() => useReviewCardMove({ current: card, online, advance }))

  return { advance, hook }
}

describe('useReviewCardMove', () => {
  it('should move the card, remember the deck and continue to the next card with a confirmation', async () => {
    mockedMove.mockResolvedValue({ moved: ['bit-1'], skipped: [] })

    const { advance, hook } = setup()

    await act(() => hook.result.current.move('s1', 'English / Words'))

    expect(mockedMove).toHaveBeenCalledWith({ data: { bitId: 'bit-1', subjectId: 's1' } })
    expect(advance).toHaveBeenCalledWith('Moved to English / Words')
    expect(loadRecentMoveTargets()).toEqual(['s1'])
  })

  it('should not send anything and ask for a connection when offline', async () => {
    const { advance, hook } = setup(false)

    await act(() => hook.result.current.move('s1', 'English'))

    expect(mockedMove).not.toHaveBeenCalled()
    expect(advance).not.toHaveBeenCalled()
    expect(hook.result.current.moveError).toBe(MOVE_OFFLINE_MESSAGE)
  })

  it('should keep the card in review and explain when a course card cannot move', async () => {
    mockedMove.mockResolvedValue({ moved: [], skipped: [{ id: 'bit-1', reason: 'curriculum_placed' }] })

    const { advance, hook } = setup()

    await act(() => hook.result.current.move('s1', 'English'))

    expect(advance).not.toHaveBeenCalled()
    expect(hook.result.current.moveError).toMatch(/course/)
    expect(loadRecentMoveTargets()).toEqual([])
  })

  it('should keep the card in review when the request fails', async () => {
    mockedMove.mockRejectedValue(new Error('down'))

    const { advance, hook } = setup()

    await act(() => hook.result.current.move('s1', 'English'))

    expect(advance).not.toHaveBeenCalled()
    expect(hook.result.current.moveError).toBe("Couldn't move the card. Try again.")
  })
})
