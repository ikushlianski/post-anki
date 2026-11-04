// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, renderHook, waitFor } from '@testing-library/react'
import type { ChatQueueKnowledgeBit } from '@post-anki/shared'

vi.mock('./chat-queue.api', () => ({
  getChatQueueThread: vi.fn(),
  sendChatQueueMessage: vi.fn(),
  deleteLastChatExchange: vi.fn(),
  returnFromChatQueue: vi.fn(),
  approveFromChatQueue: vi.fn(),
  rejectFromChatQueue: vi.fn(),
  saveChatQueueRejectReason: vi.fn(),
}))

import {
  approveFromChatQueue,
  getChatQueueThread,
  rejectFromChatQueue,
  saveChatQueueRejectReason,
  sendChatQueueMessage,
} from './chat-queue.api'
import { useChatThread } from './use-chat-thread'

const item: ChatQueueKnowledgeBit = {
  id: 'a',
  body: 'Fact a',
  background: null,
  origin: 'extracted',
  subjectName: null,
  chatAt: '2026-10-28T10:00:00.000Z',
  turnsLeft: 6,
  snoozedUntil: null,
}

const emptyThread = { ok: true, data: { messages: [], turnsLeft: 6, capReached: false } } as never

async function mount(onResolved = vi.fn()) {
  const hook = renderHook(() => useChatThread(item, onResolved))

  await waitFor(() => expect(hook.result.current.loading).toBe(false))

  return { ...hook, onResolved }
}

describe('useChatThread', () => {
  beforeEach(() => {
    localStorage.clear()
    Object.values(vi.mocked({
      approveFromChatQueue,
      getChatQueueThread,
      rejectFromChatQueue,
      saveChatQueueRejectReason,
      sendChatQueueMessage,
    })).forEach((fn) => vi.mocked(fn).mockReset())
    vi.mocked(getChatQueueThread).mockResolvedValue(emptyThread)
  })

  afterEach(cleanup)

  it('should add the question and the tutor reply, use up a turn and clear the draft', async () => {
    vi.mocked(sendChatQueueMessage).mockResolvedValue({
      ok: true,
      data: { reply: 'Because.', turnsLeft: 5, capReached: false },
    } as never)

    const { result } = await mount()

    act(() => result.current.changeDraft('Why?'))
    await act(async () => {
      await result.current.send()
    })

    expect(result.current.lines.map((line) => line.text)).toEqual(['Why?', 'Because.'])
    expect(result.current.turnsLeft).toBe(5)
    expect(result.current.draft).toBe('')
  })

  it('should take the question back into the draft and show the failure when the tutor cannot answer', async () => {
    vi.mocked(sendChatQueueMessage).mockResolvedValue({ ok: false, failure: 'model_failed' } as never)

    const { result } = await mount()

    act(() => result.current.changeDraft('Why?'))
    await act(async () => {
      await result.current.send()
    })

    expect(result.current.lines).toEqual([])
    expect(result.current.draft).toBe('Why?')
    expect(result.current.error).toContain('no question was used')
  })

  it('should stop further questions once the cap is reached', async () => {
    vi.mocked(sendChatQueueMessage).mockResolvedValue({ ok: false, failure: 'cap_reached' } as never)

    const { result } = await mount()

    act(() => result.current.changeDraft('Why?'))
    await act(async () => {
      await result.current.send()
    })

    expect(result.current.limitReached).toBe(true)
    expect(result.current.turnsLeft).toBe(0)
    expect(result.current.canSend).toBe(false)
  })

  it('should pause sending when the AI budget is paused', async () => {
    vi.mocked(sendChatQueueMessage).mockResolvedValue({ ok: false, failure: 'budget_paused' } as never)

    const { result } = await mount()

    act(() => result.current.changeDraft('Why?'))
    await act(async () => {
      await result.current.send()
    })

    expect(result.current.budgetPaused).toBe(true)
    expect(result.current.canSend).toBe(false)
  })

  it('should report the card as resolved after accepting it, and keep it with an error when accept fails', async () => {
    vi.mocked(approveFromChatQueue).mockResolvedValueOnce({ ok: false, failure: 'other' } as never)

    const { result, onResolved } = await mount()

    await act(async () => {
      await result.current.accept()
    })
    expect(onResolved).not.toHaveBeenCalled()
    expect(result.current.error).not.toBeNull()

    vi.mocked(approveFromChatQueue).mockResolvedValueOnce({ ok: true, data: {} } as never)
    await act(async () => {
      await result.current.accept()
    })

    expect(onResolved).toHaveBeenCalledWith('a')
    expect(result.current.error).toBeNull()
  })

  it('should drop the card from the list when the server says it left Chat', async () => {
    vi.mocked(approveFromChatQueue).mockResolvedValue({ ok: false, failure: 'not_in_chat' } as never)

    const { result, onResolved } = await mount()

    await act(async () => {
      await result.current.accept()
    })

    expect(onResolved).toHaveBeenCalledWith('a')
  })

  it('should ask for a reject reason when feedback is requested and resolve after saving or skipping', async () => {
    vi.mocked(rejectFromChatQueue).mockResolvedValue({ ok: true, data: { feedbackId: 'f1' } } as never)
    vi.mocked(saveChatQueueRejectReason).mockResolvedValueOnce({ ok: false, failure: 'other' } as never)

    const { result, onResolved } = await mount()

    await act(async () => {
      await result.current.reject()
    })
    expect(result.current.rejecting).toBe(true)
    expect(onResolved).not.toHaveBeenCalled()

    await act(async () => {
      await result.current.sendRejectReason('other' as never, ' note ')
    })
    expect(result.current.error).toBe("Couldn't save the reason. Try again or skip.")
    expect(onResolved).not.toHaveBeenCalled()

    vi.mocked(saveChatQueueRejectReason).mockResolvedValueOnce({ ok: true, data: {} } as never)
    await act(async () => {
      await result.current.sendRejectReason('other' as never, ' note ')
    })

    expect(saveChatQueueRejectReason).toHaveBeenLastCalledWith({
      data: { feedbackId: 'f1', reasonCode: 'other', note: 'note' },
    })
    expect(onResolved).toHaveBeenCalledWith('a')
  })

  it('should resolve immediately on reject when no feedback is requested', async () => {
    vi.mocked(rejectFromChatQueue).mockResolvedValue({ ok: true, data: {} } as never)

    const { result, onResolved } = await mount()

    await act(async () => {
      await result.current.reject()
    })

    expect(onResolved).toHaveBeenCalledWith('a')
    expect(result.current.rejecting).toBe(false)
  })
})
