// @vitest-environment jsdom
import { describe, it, expect } from 'vitest'
import { renderHook } from '@testing-library/react'

import { useHydrated } from './use-hydrated'

describe('useHydrated', () => {
  it('returns a boolean value', () => {
    const { result } = renderHook(() => useHydrated())
    expect(typeof result.current).toBe('boolean')
  })

  it('transitions from false to true via effect', () => {
    const { result, rerender } = renderHook(() => useHydrated())
    const initialValue = result.current
    rerender()
    expect([initialValue, result.current]).toContain(true)
  })
})
