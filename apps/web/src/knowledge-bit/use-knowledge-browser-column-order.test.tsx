// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest'
import { act, cleanup, renderHook } from '@testing-library/react'

import { useKnowledgeBrowserColumnOrder } from './use-knowledge-browser-column-order'

afterEach(() => {
  cleanup()
  window.localStorage.clear()
})

describe('useKnowledgeBrowserColumnOrder', () => {
  it('should remember a moved column for the next visit to the same subject', () => {
    const first = renderHook(() => useKnowledgeBrowserColumnOrder('s1'))

    act(() => first.result.current.changeOrder(['answer', 'phrasings', 'addedBy', 'addedAt', 'source', 'sourceUrl']))
    first.unmount()

    const second = renderHook(() => useKnowledgeBrowserColumnOrder('s1'))

    expect(second.result.current.order[0]).toBe('answer')
  })

  it('should not apply one subject order to another subject', () => {
    const first = renderHook(() => useKnowledgeBrowserColumnOrder('s1'))

    act(() => first.result.current.changeOrder(['answer', 'phrasings', 'addedBy', 'addedAt', 'source', 'sourceUrl']))

    const other = renderHook(() => useKnowledgeBrowserColumnOrder('s2'))

    expect(other.result.current.order[0]).toBe('phrasings')
  })

  it('should remember a hidden column after a reload', () => {
    const first = renderHook(() => useKnowledgeBrowserColumnOrder('s1'))

    act(() => first.result.current.toggle('sourceUrl'))
    first.unmount()

    const second = renderHook(() => useKnowledgeBrowserColumnOrder('s1'))

    expect(second.result.current.order).not.toContain('sourceUrl')
    expect(second.result.current.hidden).toEqual(['sourceUrl'])
    expect(second.result.current.isDefault).toBe(false)
  })

  it('should load an order saved by the older version of the page', () => {
    window.localStorage.setItem('knowledge-browser-columns:v1:s1', '["answer","phrasings"]')

    const hook = renderHook(() => useKnowledgeBrowserColumnOrder('s1'))

    expect(hook.result.current.order.slice(0, 2)).toEqual(['answer', 'phrasings'])
    expect(hook.result.current.hidden).toEqual([])
  })

  it('should restore the default order and every column after a reset', () => {
    const hook = renderHook(() => useKnowledgeBrowserColumnOrder('s1'))

    act(() => hook.result.current.changeOrder(['answer', 'phrasings', 'addedBy', 'addedAt', 'source', 'sourceUrl']))
    act(() => hook.result.current.toggle('source'))
    act(() => hook.result.current.reset())

    expect(hook.result.current.order[0]).toBe('phrasings')
    expect(hook.result.current.order).toHaveLength(6)
    expect(hook.result.current.isDefault).toBe(true)
    expect(window.localStorage.getItem('knowledge-browser-columns:v2:s1')).toBeNull()
  })
})
