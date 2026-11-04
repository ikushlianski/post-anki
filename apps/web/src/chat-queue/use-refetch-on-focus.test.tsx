// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, renderHook } from '@testing-library/react'

import { useRefetchOnFocus } from './use-refetch-on-focus'

function showTab() {
  Object.defineProperty(document, 'visibilityState', { value: 'visible', configurable: true })
  document.dispatchEvent(new Event('visibilitychange'))
}

describe('useRefetchOnFocus', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-10-28T10:00:00.000Z'))
  })

  afterEach(() => {
    cleanup()
    vi.useRealTimers()
  })

  it('should refresh when the user returns to the tab after a while', () => {
    const callback = vi.fn()

    renderHook(() => useRefetchOnFocus(callback))
    vi.advanceTimersByTime(11_000)
    showTab()

    expect(callback).toHaveBeenCalledTimes(1)
  })

  it('should refresh when the window regains focus', () => {
    const callback = vi.fn()

    renderHook(() => useRefetchOnFocus(callback))
    vi.advanceTimersByTime(11_000)
    window.dispatchEvent(new Event('focus'))

    expect(callback).toHaveBeenCalledTimes(1)
  })

  it('should not refresh again within 10 seconds', () => {
    const callback = vi.fn()

    renderHook(() => useRefetchOnFocus(callback))
    vi.advanceTimersByTime(11_000)
    showTab()
    vi.advanceTimersByTime(5_000)
    showTab()

    expect(callback).toHaveBeenCalledTimes(1)

    vi.advanceTimersByTime(6_000)
    showTab()

    expect(callback).toHaveBeenCalledTimes(2)
  })

  it('should stop listening after unmount', () => {
    const callback = vi.fn()
    const { unmount } = renderHook(() => useRefetchOnFocus(callback))

    unmount()
    vi.advanceTimersByTime(11_000)
    showTab()
    window.dispatchEvent(new Event('focus'))

    expect(callback).not.toHaveBeenCalled()
  })
})
