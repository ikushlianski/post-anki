// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, renderHook } from '@testing-library/react'
import type { ChatQueueKnowledgeBit } from '@post-anki/shared'

vi.mock('./chat-queue.api', () => ({ getChatQueue: vi.fn() }))

import { getChatQueue } from './chat-queue.api'
import { useChatQueue } from './use-chat-queue'

function bit(id: string): ChatQueueKnowledgeBit {
  return {
    id,
    body: `Fact ${id}`,
    background: null,
    origin: 'extracted',
    subjectName: null,
    chatAt: '2026-10-28T10:00:00.000Z',
    turnsLeft: 6,
    snoozedUntil: null,
  }
}

function ok(ids: string[]) {
  return { ok: true as const, data: { items: ids.map(bit) } } as never
}

async function returnToTab() {
  vi.advanceTimersByTime(11_000)
  Object.defineProperty(document, 'visibilityState', { value: 'visible', configurable: true })
  await act(async () => {
    document.dispatchEvent(new Event('visibilitychange'))
  })
}

describe('useChatQueue refresh on focus', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.mocked(getChatQueue).mockReset()
  })

  afterEach(() => {
    cleanup()
    vi.useRealTimers()
  })

  it('should pick up cards added elsewhere without showing the loading state', async () => {
    vi.mocked(getChatQueue).mockResolvedValueOnce(ok(['a']))
    const { result } = renderHook(() => useChatQueue())

    await act(async () => {})
    vi.mocked(getChatQueue).mockResolvedValueOnce(ok(['a', 'b']))
    await returnToTab()

    expect(result.current.state).toEqual({ status: 'ready', items: [bit('a'), bit('b')] })
  })

  it('should lower the truncation notice after a card leaves and drop it when nothing is hidden', async () => {
    vi.mocked(getChatQueue).mockResolvedValueOnce({
      ok: true,
      data: { items: ['a', 'b', 'c'].map(bit), total: 4, hasMore: true },
    } as never)
    const { result } = renderHook(() => useChatQueue())

    await act(async () => {})
    expect(result.current.truncation).toEqual({ shown: 3, total: 4 })

    act(() => result.current.resolved('a'))
    expect(result.current.truncation).toEqual({ shown: 2, total: 3 })

    act(() => result.current.resolvedMany(['b']))
    expect(result.current.truncation).toEqual({ shown: 1, total: 2 })
  })

  it('should keep current cards when the silent refresh fails', async () => {
    vi.mocked(getChatQueue).mockResolvedValueOnce(ok(['a']))
    const { result } = renderHook(() => useChatQueue())

    await act(async () => {})
    vi.mocked(getChatQueue).mockRejectedValueOnce(new Error('offline'))
    await returnToTab()

    expect(result.current.state).toEqual({ status: 'ready', items: [bit('a')] })
  })

  it('should not bring back a card removed while the refresh was in flight', async () => {
    vi.mocked(getChatQueue).mockResolvedValueOnce(ok(['a', 'b']))
    const { result } = renderHook(() => useChatQueue())

    await act(async () => {})

    let release: (value: never) => void = () => {}

    vi.mocked(getChatQueue).mockReturnValueOnce(new Promise((resolve) => (release = resolve)))
    await returnToTab()
    act(() => result.current.resolved('a'))
    await act(async () => release(ok(['a', 'b'])))

    expect(result.current.state).toEqual({ status: 'ready', items: [bit('b')] })
  })

  it('should keep a snooze set while the refresh was in flight', async () => {
    vi.mocked(getChatQueue).mockResolvedValueOnce(ok(['a', 'b']))
    const { result } = renderHook(() => useChatQueue())

    await act(async () => {})

    let release: (value: never) => void = () => {}

    vi.mocked(getChatQueue).mockReturnValueOnce(new Promise((resolve) => (release = resolve)))
    await returnToTab()
    act(() => result.current.snoozedChanged('a', '2026-11-01T00:00:00.000Z'))
    await act(async () => release(ok(['a', 'b'])))

    expect(result.current.state).toEqual({
      status: 'ready',
      items: [{ ...bit('a'), snoozedUntil: '2026-11-01T00:00:00.000Z' }, bit('b')],
    })
  })

  it('should keep an unsnooze made while the refresh was in flight', async () => {
    const snoozed = { ...bit('a'), snoozedUntil: '2026-11-01T00:00:00.000Z' }

    vi.mocked(getChatQueue).mockResolvedValueOnce({ ok: true, data: { items: [snoozed] } } as never)
    const { result } = renderHook(() => useChatQueue())

    await act(async () => {})

    let release: (value: never) => void = () => {}

    vi.mocked(getChatQueue).mockReturnValueOnce(new Promise((resolve) => (release = resolve)))
    await returnToTab()
    act(() => result.current.snoozedChanged('a', null))
    await act(async () => release({ ok: true, data: { items: [snoozed] } } as never))

    expect(result.current.state).toEqual({ status: 'ready', items: [bit('a')] })
  })

  it('should take the server result as is when nothing changed during the refresh', async () => {
    vi.mocked(getChatQueue).mockResolvedValueOnce(ok(['a']))
    const { result } = renderHook(() => useChatQueue())

    await act(async () => {})
    act(() => result.current.snoozedChanged('a', '2026-11-01T00:00:00.000Z'))
    vi.mocked(getChatQueue).mockResolvedValueOnce(ok(['a', 'b']))
    await returnToTab()

    expect(result.current.state).toEqual({ status: 'ready', items: [bit('a'), bit('b')] })
  })
})
