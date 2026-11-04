// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, renderHook } from '@testing-library/react'

vi.mock('./chat-queue.api', () => ({ createCardFromChatMessage: vi.fn() }))

import { createCardFromChatMessage } from './chat-queue.api'
import { useChatCard } from './use-chat-card'

describe('useChatCard', () => {
  beforeEach(() => {
    vi.mocked(createCardFromChatMessage).mockReset()
  })

  afterEach(cleanup)

  it('should save the trimmed card, remember the message as saved and close the form', async () => {
    vi.mocked(createCardFromChatMessage).mockResolvedValue({ ok: true, data: {} } as never)

    const { result } = renderHook(() => useChatCard('b1', false))

    act(() => result.current.open(3, 'Answer'))
    act(() => result.current.edit({ front: '  Question  ' }))
    await act(async () => {
      await result.current.save()
    })

    expect(createCardFromChatMessage).toHaveBeenCalledWith({
      data: { bitId: 'b1', seq: 3, card: { front: 'Question', back: 'Answer' } },
    })
    expect(result.current.savedSeqs).toEqual([3])
    expect(result.current.draft).toBeNull()
  })

  it('should not call the server while the front is empty or the thread is busy', async () => {
    const { result, rerender } = renderHook(({ locked }) => useChatCard('b1', locked), {
      initialProps: { locked: false },
    })

    act(() => result.current.open(1, 'Answer'))
    await act(async () => {
      await result.current.save()
    })
    act(() => result.current.edit({ front: 'Q' }))
    rerender({ locked: true })
    await act(async () => {
      await result.current.save()
    })

    expect(createCardFromChatMessage).not.toHaveBeenCalled()
  })

  it('should keep the draft and show the failure, then clear it on cancel', async () => {
    vi.mocked(createCardFromChatMessage).mockResolvedValue({ ok: false, failure: 'offline' } as never)

    const { result } = renderHook(() => useChatCard('b1', false))

    act(() => result.current.open(1, 'Answer'))
    act(() => result.current.edit({ front: 'Q' }))
    await act(async () => {
      await result.current.save()
    })

    expect(result.current.error).toContain('offline')
    expect(result.current.draft).not.toBeNull()
    expect(result.current.savedSeqs).toEqual([])

    act(() => result.current.cancel())

    expect(result.current.error).toBeNull()
    expect(result.current.draft).toBeNull()
  })

  it('should show a generic failure when the request throws', async () => {
    vi.mocked(createCardFromChatMessage).mockRejectedValue(new Error('x'))

    const { result } = renderHook(() => useChatCard('b1', false))

    act(() => result.current.open(1, 'A'))
    act(() => result.current.edit({ front: 'Q' }))
    await act(async () => {
      await result.current.save()
    })

    expect(result.current.error).not.toBeNull()
    expect(result.current.saving).toBe(false)
  })
})
