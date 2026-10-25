// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, renderHook } from '@testing-library/react'

import { useColumnWidths } from './use-column-widths'

const KEY = 'test:column-widths'
const DEFAULTS = { a: 100, b: 200 }

beforeEach(() => window.localStorage.clear())

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
})

describe('useColumnWidths', () => {
  it('should start from the default widths when nothing was saved', () => {
    const { result } = renderHook(() => useColumnWidths(KEY, DEFAULTS))

    expect(result.current.widths).toEqual(DEFAULTS)
  })

  it('should save a resized column so the next visit restores it', () => {
    const first = renderHook(() => useColumnWidths(KEY, DEFAULTS))

    act(() => first.result.current.setWidth('a', 321))
    first.unmount()

    const second = renderHook(() => useColumnWidths(KEY, DEFAULTS))

    expect(second.result.current.widths).toEqual({ a: 321, b: 200 })
  })

  it('should never let a column get narrower than 60px', () => {
    const { result } = renderHook(() => useColumnWidths(KEY, DEFAULTS))

    act(() => result.current.setWidth('a', 5))

    expect(result.current.widths.a).toBe(60)
    expect(JSON.parse(window.localStorage.getItem(KEY) ?? '{}').a).toBe(60)
  })

  it('should clamp too-small widths that were saved earlier', () => {
    window.localStorage.setItem(KEY, JSON.stringify({ a: 10 }))

    const { result } = renderHook(() => useColumnWidths(KEY, DEFAULTS))

    expect(result.current.widths.a).toBe(60)
  })

  it('should ignore corrupt saved data and use the defaults', () => {
    window.localStorage.setItem(KEY, '{not json')

    const { result } = renderHook(() => useColumnWidths(KEY, DEFAULTS))

    expect(result.current.widths).toEqual(DEFAULTS)
  })

  it('should ignore saved data of the wrong shape', () => {
    window.localStorage.setItem(KEY, JSON.stringify({ a: 'wide' }))

    const { result } = renderHook(() => useColumnWidths(KEY, DEFAULTS))

    expect(result.current.widths).toEqual(DEFAULTS)
  })

  it('should keep working when storage throws on read and write', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('blocked')
    })
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('blocked')
    })

    const { result } = renderHook(() => useColumnWidths(KEY, DEFAULTS))

    act(() => result.current.setWidth('b', 250))

    expect(result.current.widths).toEqual({ a: 100, b: 250 })
  })
})
