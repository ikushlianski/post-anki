// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, renderHook } from '@testing-library/react'

import { clearChatDraft } from './chat-queue-draft-storage'
import { useChatDraftPersistence } from './use-chat-draft-persistence'

const KEY = 'chat-queue-draft:a'

beforeEach(() => {
  vi.useFakeTimers()
})

afterEach(() => {
  cleanup()
  vi.useRealTimers()
  window.localStorage.clear()
})

describe('useChatDraftPersistence', () => {
  it('should save a draft typed just before the thread closes', () => {
    const { unmount } = renderHook(() => useChatDraftPersistence('a', 'half typed'))

    expect(window.localStorage.getItem(KEY)).toBeNull()

    unmount()

    expect(window.localStorage.getItem(KEY)).toBe('half typed')
  })

  it('should save a draft typed just before the page is reloaded', () => {
    renderHook(() => useChatDraftPersistence('a', 'half typed'))

    act(() => {
      window.dispatchEvent(new Event('pagehide'))
    })

    expect(window.localStorage.getItem(KEY)).toBe('half typed')
  })

  it('should not bring a draft back after it was sent or the card left Chat', () => {
    const { unmount } = renderHook(() => useChatDraftPersistence('a', 'sent text'))

    clearChatDraft('a')
    act(() => {
      vi.advanceTimersByTime(1000)
      window.dispatchEvent(new Event('pagehide'))
    })
    unmount()

    expect(window.localStorage.getItem(KEY)).toBeNull()
  })

  it('should save again when the user types after a clear', () => {
    const { rerender, unmount } = renderHook(
      ({ draft }) => useChatDraftPersistence('a', draft),
      { initialProps: { draft: 'one' } },
    )

    clearChatDraft('a')
    rerender({ draft: 'two' })
    unmount()

    expect(window.localStorage.getItem(KEY)).toBe('two')
  })
})
