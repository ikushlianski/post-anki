// @vitest-environment jsdom
import { act, cleanup, renderHook } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'

import { useOnlineStatus } from './use-online-status'

function setOnline(value: boolean) {
  Object.defineProperty(navigator, 'onLine', { value, configurable: true })
  window.dispatchEvent(new Event(value ? 'online' : 'offline'))
}

afterEach(() => {
  cleanup()
  setOnline(true)
})

describe('useOnlineStatus', () => {
  it('should follow the browser going offline and coming back', () => {
    const { result } = renderHook(() => useOnlineStatus())

    expect(result.current).toBe(true)

    act(() => setOnline(false))
    expect(result.current).toBe(false)

    act(() => setOnline(true))
    expect(result.current).toBe(true)
  })
})
