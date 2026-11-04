// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, renderHook } from '@testing-library/react'

vi.mock('./chat-queue.api', () => ({
  rejectFromChatQueue: vi.fn(),
  saveChatQueueRejectReason: vi.fn(),
}))

import { rejectFromChatQueue, saveChatQueueRejectReason } from './chat-queue.api'
import { useChatReject } from './use-chat-reject'

function setup() {
  const busy = { current: false }
  const handle = vi.fn()
  const onResolved = vi.fn()
  const setResolving = vi.fn()
  const setError = vi.fn()
  const hook = renderHook(() =>
    useChatReject('b1', busy, handle, onResolved, setResolving, setError),
  )

  return { busy, handle, onResolved, setResolving, setError, ...hook }
}

describe('useChatReject', () => {
  beforeEach(() => {
    vi.mocked(rejectFromChatQueue).mockReset()
    vi.mocked(saveChatQueueRejectReason).mockReset()
  })

  afterEach(cleanup)

  it('should ask for a reason instead of resolving when the server returns a feedback id', async () => {
    vi.mocked(rejectFromChatQueue).mockResolvedValue({
      ok: true,
      data: { feedbackId: 'f1' },
    } as never)

    const { result, onResolved, busy, setResolving } = setup()

    await act(async () => {
      await result.current.reject()
    })

    expect(rejectFromChatQueue).toHaveBeenCalledWith({ data: { bitId: 'b1' } })
    expect(result.current.rejecting).toBe(true)
    expect(onResolved).not.toHaveBeenCalled()
    expect(setResolving).toHaveBeenLastCalledWith(false)
    expect(busy.current).toBe(false)
  })

  it('should resolve the item right away when no feedback id comes back', async () => {
    vi.mocked(rejectFromChatQueue).mockResolvedValue({ ok: true, data: {} } as never)

    const { result, onResolved } = setup()

    await act(async () => {
      await result.current.reject()
    })

    expect(onResolved).toHaveBeenCalledWith('b1')
    expect(result.current.rejecting).toBe(false)
  })

  it('should route a failed reject to the error handler and release the busy state', async () => {
    vi.mocked(rejectFromChatQueue).mockResolvedValue({ ok: false, failure: 'offline' } as never)

    const { result, handle, onResolved, busy, setResolving, setError } = setup()

    await act(async () => {
      await result.current.reject()
    })

    expect(handle).toHaveBeenCalledWith('offline')
    expect(onResolved).not.toHaveBeenCalled()
    expect(result.current.rejecting).toBe(false)
    expect(setError).toHaveBeenCalledWith(null)
    expect(setResolving).toHaveBeenNthCalledWith(1, true)
    expect(setResolving).toHaveBeenLastCalledWith(false)
    expect(busy.current).toBe(false)
  })

  it('should ignore a reject while another action is already in progress', async () => {
    const { result, busy } = setup()

    busy.current = true

    await act(async () => {
      await result.current.reject()
    })

    expect(rejectFromChatQueue).not.toHaveBeenCalled()
  })

  it('should send the reason with a trimmed note and resolve the item', async () => {
    vi.mocked(rejectFromChatQueue).mockResolvedValue({
      ok: true,
      data: { feedbackId: 'f1' },
    } as never)
    vi.mocked(saveChatQueueRejectReason).mockResolvedValue({ ok: true, data: {} } as never)

    const { result, onResolved } = setup()

    await act(async () => {
      await result.current.reject()
    })
    await act(async () => {
      await result.current.sendRejectReason('wrong' as never, '  too vague  ')
    })

    expect(saveChatQueueRejectReason).toHaveBeenCalledWith({
      data: { feedbackId: 'f1', reasonCode: 'wrong', note: 'too vague' },
    })
    expect(onResolved).toHaveBeenCalledWith('b1')
  })

  it('should omit the note when it is only whitespace', async () => {
    vi.mocked(rejectFromChatQueue).mockResolvedValue({
      ok: true,
      data: { feedbackId: 'f1' },
    } as never)
    vi.mocked(saveChatQueueRejectReason).mockResolvedValue({ ok: true, data: {} } as never)

    const { result } = setup()

    await act(async () => {
      await result.current.reject()
    })
    await act(async () => {
      await result.current.sendRejectReason('wrong' as never, '   ')
    })

    expect(saveChatQueueRejectReason).toHaveBeenCalledWith({
      data: { feedbackId: 'f1', reasonCode: 'wrong' },
    })
  })

  it('should show a retry message and keep the item when saving the reason fails', async () => {
    vi.mocked(rejectFromChatQueue).mockResolvedValue({
      ok: true,
      data: { feedbackId: 'f1' },
    } as never)
    vi.mocked(saveChatQueueRejectReason).mockResolvedValue({
      ok: false,
      failure: 'offline',
    } as never)

    const { result, onResolved, setError } = setup()

    await act(async () => {
      await result.current.reject()
    })
    await act(async () => {
      await result.current.sendRejectReason('wrong' as never, '')
    })

    expect(setError).toHaveBeenLastCalledWith("Couldn't save the reason. Try again or skip.")
    expect(onResolved).not.toHaveBeenCalled()
  })

  it('should not send a reason before a reject has produced a feedback id', async () => {
    const { result, onResolved } = setup()

    await act(async () => {
      await result.current.sendRejectReason('wrong' as never, 'note')
    })

    expect(saveChatQueueRejectReason).not.toHaveBeenCalled()
    expect(onResolved).not.toHaveBeenCalled()
  })

  it('should resolve without sending anything when the reason is skipped', () => {
    const { result, onResolved } = setup()

    act(() => result.current.skipRejectReason())

    expect(onResolved).toHaveBeenCalledWith('b1')
    expect(saveChatQueueRejectReason).not.toHaveBeenCalled()
  })
})
