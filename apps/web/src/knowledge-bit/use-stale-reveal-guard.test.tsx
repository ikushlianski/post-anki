// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest'
import { renderHook } from '@testing-library/react'
import type { ReviewCard } from '@post-anki/shared'

import { initialAnkiReviewSession } from './anki-review-session'
import { useStaleRevealGuard } from './use-stale-reveal-guard'

const card = (id: string) => ({ variantId: id, knowledgeBitId: 'bit-1' }) as ReviewCard

describe('useStaleRevealGuard', () => {
  it('should hide the answer when a revealed card is swapped for another without a new card being shown', () => {
    const dispatch = vi.fn()
    const state = { ...initialAnkiReviewSession(1), revealed: true }
    const { rerender } = renderHook(({ current }) => useStaleRevealGuard(state, current, dispatch), {
      initialProps: { current: card('a') },
    })

    rerender({ current: card('b') })

    expect(dispatch).toHaveBeenCalledWith(expect.objectContaining({ type: 'staleRevealCleared' }))
  })

  it('should leave the answer alone when the same card is only re-rendered', () => {
    const dispatch = vi.fn()
    const state = { ...initialAnkiReviewSession(1), revealed: true }
    const { rerender } = renderHook(({ current }) => useStaleRevealGuard(state, current, dispatch), {
      initialProps: { current: card('a') },
    })

    rerender({ current: card('a') })

    expect(dispatch).not.toHaveBeenCalled()
  })

  it('should leave the answer alone when the card id changes because the learner saved an edit', () => {
    const dispatch = vi.fn()
    const state = {
      ...initialAnkiReviewSession(1),
      revealed: true,
      edits: { 'bit-1': { variantId: 'b', replacesVariantId: 'a', prompt: 'p', answer: 'a' } },
    }
    const { rerender } = renderHook(({ current }) => useStaleRevealGuard(state, current, dispatch), {
      initialProps: { current: card('a') },
    })

    rerender({ current: card('b') })

    expect(dispatch).not.toHaveBeenCalled()
  })
})
