// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, renderHook } from '@testing-library/react'

import {
  QUESTION_POLL_MAX_ATTEMPTS,
  REGENERATION_POLL_MAX_ATTEMPTS,
  useQuestionPolling,
} from './knowledge-bit-review-polling'

describe('useQuestionPolling', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    cleanup()
    vi.useRealTimers()
  })

  it('should give up after the default attempt budget', async () => {
    const refresh = vi.fn().mockResolvedValue(undefined)
    const { result } = renderHook(() => useQuestionPolling(true, refresh, 10))

    await act(async () => {
      await vi.advanceTimersByTimeAsync(10 * (QUESTION_POLL_MAX_ATTEMPTS + 1))
    })

    expect(result.current).toBe(true)
    expect(refresh).toHaveBeenCalledTimes(QUESTION_POLL_MAX_ATTEMPTS)
  })

  it('should keep polling past the default budget while a regeneration runs', async () => {
    const refresh = vi.fn().mockResolvedValue(undefined)
    const { result } = renderHook(() =>
      useQuestionPolling(true, refresh, 10, REGENERATION_POLL_MAX_ATTEMPTS),
    )

    await act(async () => {
      await vi.advanceTimersByTimeAsync(10 * (QUESTION_POLL_MAX_ATTEMPTS + 20))
    })

    expect(result.current).toBe(false)
    expect(refresh).toHaveBeenCalledTimes(QUESTION_POLL_MAX_ATTEMPTS + 20)
  })
})
