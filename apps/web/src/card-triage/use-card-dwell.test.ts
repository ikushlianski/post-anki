// @vitest-environment jsdom
import { renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { useCardDwell } from './use-card-dwell'

describe('useCardDwell', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-10-25T10:00:00.000Z'))
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('should report how long a card was on screen before it was decided', () => {
    const { result } = renderHook(() => useCardDwell('b1'))

    vi.advanceTimersByTime(2500)

    expect(result.current('b1')).toBe(2500)
  })

  it('should start counting again when the same card comes back after an undo', () => {
    const { result } = renderHook(() => useCardDwell('b1'))

    vi.advanceTimersByTime(1000)
    result.current('b1')

    expect(result.current('b1')).toBeUndefined()
  })

  it('should not measure time while no card is shown', () => {
    const { result, rerender } = renderHook(({ id }) => useCardDwell(id), {
      initialProps: { id: 'b1' as string | undefined },
    })

    rerender({ id: undefined })
    vi.advanceTimersByTime(4000)

    expect(result.current('b1')).toBeUndefined()
  })
})
