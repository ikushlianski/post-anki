// @vitest-environment jsdom
import { act, renderHook } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import {
  approveKnowledgeBitForReview,
  rejectKnowledgeBitForReview,
  restoreKnowledgeBitForReview,
} from './knowledge-bit-review.api'
import { useReviewDecisions } from './use-review-decisions'

vi.mock('./knowledge-bit-review.api', () => ({
  approveKnowledgeBitForReview: vi.fn(),
  rejectKnowledgeBitForReview: vi.fn(),
  triageKnowledgeBitForReview: vi.fn(),
  undoTriageKnowledgeBitForReview: vi.fn(),
  restoreKnowledgeBitForReview: vi.fn(),
}))

function setup() {
  return renderHook(() =>
    useReviewDecisions({
      knownBitIds: { current: new Set<string>() },
      claimBit: () => true,
      releaseBit: () => undefined,
    }),
  )
}

describe('useReviewDecisions undo', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(approveKnowledgeBitForReview).mockResolvedValue({ ok: true } as never)
    vi.mocked(rejectKnowledgeBitForReview).mockResolvedValue({ feedbackId: 'fb-2' } as never)
    vi.mocked(restoreKnowledgeBitForReview).mockResolvedValue(undefined as never)
  })

  it('should walk back through the last decisions one by one, newest first', async () => {
    const { result } = setup()

    await act(() => result.current.approve('bit-1'))
    await act(() => result.current.reject('bit-2'))
    await act(() => result.current.approve('bit-3'))

    await act(async () => {
      await result.current.undoLast()
    })

    expect(restoreKnowledgeBitForReview).toHaveBeenLastCalledWith({ data: { bitId: 'bit-3' } })
    expect(Object.keys(result.current.decisions)).toEqual(['bit-1', 'bit-2'])

    await act(async () => {
      await result.current.undoLast()
    })

    expect(restoreKnowledgeBitForReview).toHaveBeenLastCalledWith({ data: { bitId: 'bit-2' } })

    await act(async () => {
      await result.current.undoLast()
    })

    expect(restoreKnowledgeBitForReview).toHaveBeenLastCalledWith({ data: { bitId: 'bit-1' } })
    expect(result.current.decisions).toEqual({})
  })

  it('should keep the decision and show an error when the undo fails', async () => {
    const { result } = setup()

    await act(() => result.current.approve('bit-1'))
    vi.mocked(restoreKnowledgeBitForReview).mockRejectedValueOnce(new Error('boom'))

    await act(async () => {
      await result.current.undoLast()
    })

    expect(result.current.decisions['bit-1']?.verdict).toBe('approved')
    expect(result.current.rowErrors['bit-1']).toBe("Couldn't undo. Try again.")

    await act(async () => {
      await result.current.undoLast()
    })

    expect(result.current.decisions).toEqual({})
  })

  it('should do nothing when there is nothing to undo', async () => {
    const { result } = setup()

    await act(async () => {
      await result.current.undoLast()
    })

    expect(restoreKnowledgeBitForReview).not.toHaveBeenCalled()
  })
})
