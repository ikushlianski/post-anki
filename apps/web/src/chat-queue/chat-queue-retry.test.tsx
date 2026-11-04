// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { ChatQueueKnowledgeBit } from '@post-anki/shared'

vi.mock('./chat-queue.api', () => ({
  getChatQueueThread: vi.fn(),
  sendChatQueueMessage: vi.fn(),
  deleteLastChatExchange: vi.fn(),
  returnFromChatQueue: vi.fn(),
  approveFromChatQueue: vi.fn(),
  rejectFromChatQueue: vi.fn(),
  saveChatQueueRejectReason: vi.fn(),
  createCardFromChatMessage: vi.fn(),
  snoozeChatQueueCard: vi.fn(),
  unsnoozeChatQueueCard: vi.fn(),
}))

import { deleteLastChatExchange, getChatQueueThread, sendChatQueueMessage } from './chat-queue.api'
import { ChatQueueThread } from './chat-queue-thread'

const bit: ChatQueueKnowledgeBit = {
  id: 'a',
  body: 'Fact a',
  background: null,
  origin: 'extracted',
  subjectName: null,
  chatAt: '2026-10-28T10:00:00.000Z',
  turnsLeft: 6,
  snoozedUntil: null,
}

const thread = {
  messages: [
    { seq: 1, role: 'user', text: 'first question' },
    { seq: 2, role: 'assistant', text: 'first answer' },
    { seq: 3, role: 'user', text: 'second question' },
    { seq: 4, role: 'assistant', text: 'second answer' },
  ],
  turnsLeft: 5,
  capReached: false,
}

function renderThread() {
  return render(
    <ChatQueueThread item={bit} onBack={vi.fn()} onResolved={vi.fn()} onSnoozeChanged={vi.fn()} />,
  )
}

beforeEach(() => {
  window.localStorage.clear()
  vi.mocked(getChatQueueThread).mockResolvedValue({ ok: true, data: thread } as never)
})

afterEach(() => {
  cleanup()
  vi.resetAllMocks()
})

describe('retry last answer', () => {
  it('should show Retry only on the last tutor reply', async () => {
    renderThread()

    await screen.findByText('second answer')

    expect(screen.getAllByTestId('chat-queue-retry')).toHaveLength(1)
  })

  it('should drop the last exchange and ask the same question again through the normal send', async () => {
    vi.mocked(deleteLastChatExchange).mockResolvedValue({
      ok: true,
      data: { ok: true, turnsLeft: 6, capReached: false },
    } as never)
    vi.mocked(sendChatQueueMessage).mockResolvedValue({
      ok: true,
      data: { reply: 'better answer', turnsLeft: 5, capReached: false },
    } as never)
    renderThread()

    await userEvent.click(await screen.findByTestId('chat-queue-retry'))

    expect(await screen.findByText('better answer')).toBeTruthy()
    expect(screen.queryByText('second answer')).toBeNull()
    expect(vi.mocked(sendChatQueueMessage).mock.calls[0]?.[0]).toMatchObject({
      data: { bitId: 'a', message: { message: 'second question' } },
    })
  })

  it('should keep the thread untouched and not resend when the delete fails', async () => {
    vi.mocked(deleteLastChatExchange).mockResolvedValue({
      ok: false,
      failure: 'offline',
    } as never)
    renderThread()

    await userEvent.click(await screen.findByTestId('chat-queue-retry'))

    await waitFor(() => expect(screen.getByTestId('chat-queue-error')).toBeTruthy())
    expect(sendChatQueueMessage).not.toHaveBeenCalled()
    expect(screen.getByText('second answer')).toBeTruthy()
  })

  it('should put the question back in the draft when the resend fails after the delete', async () => {
    vi.mocked(deleteLastChatExchange).mockResolvedValue({
      ok: true,
      data: { ok: true, turnsLeft: 6, capReached: false },
    } as never)
    vi.mocked(sendChatQueueMessage).mockResolvedValue({ ok: false, failure: 'offline' } as never)
    renderThread()

    await userEvent.click(await screen.findByTestId('chat-queue-retry'))

    await waitFor(() =>
      expect((screen.getByLabelText('Ask about this card') as HTMLTextAreaElement).value).toBe(
        'second question',
      ),
    )
    expect(screen.getByTestId('chat-queue-error')).toBeTruthy()
  })

  it('should keep an unsent draft when retry succeeds', async () => {
    vi.mocked(deleteLastChatExchange).mockResolvedValue({
      ok: true,
      data: { ok: true, turnsLeft: 6, capReached: false },
    } as never)
    vi.mocked(sendChatQueueMessage).mockResolvedValue({
      ok: true,
      data: { reply: 'better answer', turnsLeft: 5, capReached: false },
    } as never)
    renderThread()

    await userEvent.type(await screen.findByLabelText('Ask about this card'), 'half typed')
    await userEvent.click(screen.getByTestId('chat-queue-retry'))
    await screen.findByText('better answer')

    expect((screen.getByLabelText('Ask about this card') as HTMLTextAreaElement).value).toBe('half typed')
  })

  it('should keep both the retried question and a different typed draft when the resend fails', async () => {
    vi.mocked(deleteLastChatExchange).mockResolvedValue({
      ok: true,
      data: { ok: true, turnsLeft: 6, capReached: false },
    } as never)
    vi.mocked(sendChatQueueMessage).mockResolvedValue({ ok: false, failure: 'offline' } as never)
    renderThread()

    await userEvent.type(await screen.findByLabelText('Ask about this card'), 'half typed')
    await userEvent.click(screen.getByTestId('chat-queue-retry'))
    await screen.findByTestId('chat-queue-error')

    const value = (screen.getByLabelText('Ask about this card') as HTMLTextAreaElement).value

    expect(value).toContain('second question')
    expect(value).toContain('half typed')
  })
})
