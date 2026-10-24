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

    act(() => first.result.current.changeOrder(['answer', 'phrasings', 'addedBy', 'addedAt']))
    first.unmount()

    const second = renderHook(() => useKnowledgeBrowserColumnOrder('s1'))

    expect(second.result.current.order[0]).toBe('answer')
  })

  it('should not apply one subject order to another subject', () => {
    const first = renderHook(() => useKnowledgeBrowserColumnOrder('s1'))

    act(() => first.result.current.changeOrder(['answer', 'phrasings', 'addedBy', 'addedAt']))

    const other = renderHook(() => useKnowledgeBrowserColumnOrder('s2'))

    expect(other.result.current.order[0]).toBe('phrasings')
  })

  it('should go back to the default order after a reset', () => {
    const hook = renderHook(() => useKnowledgeBrowserColumnOrder('s1'))

    act(() => hook.result.current.changeOrder(['answer', 'phrasings', 'addedBy', 'addedAt']))
    act(() => hook.result.current.reset())

    expect(hook.result.current.order[0]).toBe('phrasings')
    expect(hook.result.current.isDefault).toBe(true)
    expect(window.localStorage.getItem('knowledge-browser-columns:v1:s1')).toBeNull()
  })
})
