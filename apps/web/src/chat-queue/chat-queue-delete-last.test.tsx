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
  snoozeChatQueueCard: vi.fn(),
  unsnoozeChatQueueCard: vi.fn(),
}))

import { deleteLastChatExchange, getChatQueueThread } from './chat-queue.api'
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

const twoExchanges = {
  messages: [
    { seq: 1, role: 'user', text: 'first question' },
    { seq: 2, role: 'assistant', text: 'first answer' },
    { seq: 3, role: 'user', text: 'second question' },
    { seq: 4, role: 'assistant', text: 'second answer' },
  ],
  turnsLeft: 6,
  capReached: false,
}

function renderThread() {
  return render(
    <ChatQueueThread item={bit} onBack={vi.fn()} onResolved={vi.fn()} onSnoozeChanged={vi.fn()} />,
  )
}

beforeEach(() => {
  window.localStorage.clear()
  vi.mocked(getChatQueueThread).mockResolvedValue({ ok: true, data: twoExchanges } as never)
})

afterEach(() => {
  cleanup()
  vi.resetAllMocks()
})

describe('delete last exchange', () => {
  it('should ask for confirmation before deleting and keep the thread when the user keeps it', async () => {
    renderThread()

    await userEvent.click(await screen.findByTestId('chat-queue-delete-last'))
    await userEvent.click(screen.getByTestId('chat-queue-delete-last-cancel'))

    expect(deleteLastChatExchange).not.toHaveBeenCalled()
    expect(screen.getByText('second answer')).toBeTruthy()
  })

  it('should drop the last question and reply and show the turn that came back', async () => {
    vi.mocked(deleteLastChatExchange).mockResolvedValue({
      ok: true,
      data: { ok: true, turnsLeft: 7, capReached: false },
    } as never)
    renderThread()

    await userEvent.click(await screen.findByTestId('chat-queue-delete-last'))
    await userEvent.click(screen.getByTestId('chat-queue-delete-last-yes'))

    await waitFor(() => expect(screen.queryByText('second answer')).toBeNull())
    expect(deleteLastChatExchange).toHaveBeenCalledWith({ data: { bitId: 'a' } })
    expect(screen.getByText('first answer')).toBeTruthy()
    expect(screen.getByTestId('chat-queue-turns-left').getAttribute('aria-label')).toBe('7 of 8 turns left')
  })

  it('should reopen the input when deleting an exchange frees a turn at the limit', async () => {
    vi.mocked(getChatQueueThread).mockResolvedValue({
      ok: true,
      data: { ...twoExchanges, turnsLeft: 0, capReached: true },
    } as never)
    vi.mocked(deleteLastChatExchange).mockResolvedValue({
      ok: true,
      data: { ok: true, turnsLeft: 1, capReached: false },
    } as never)
    renderThread()

    expect(await screen.findByTestId('chat-queue-limit')).toBeTruthy()

    await userEvent.click(screen.getByTestId('chat-queue-delete-last'))
    await userEvent.click(screen.getByTestId('chat-queue-delete-last-yes'))

    expect(await screen.findByTestId('chat-queue-send')).toBeTruthy()
    expect(screen.queryByTestId('chat-queue-limit')).toBeNull()
  })

  it('should keep the thread and explain when the AI is still answering', async () => {
    vi.mocked(deleteLastChatExchange).mockResolvedValue({ ok: false, failure: 'in_flight' } as never)
    renderThread()

    await userEvent.click(await screen.findByTestId('chat-queue-delete-last'))
    await userEvent.click(screen.getByTestId('chat-queue-delete-last-yes'))

    expect((await screen.findByTestId('chat-queue-error')).textContent).toContain('still answering')
    expect(screen.getByText('second answer')).toBeTruthy()
  })

  it('should not offer deletion before any message exists', async () => {
    vi.mocked(getChatQueueThread).mockResolvedValue({
      ok: true,
      data: { messages: [], turnsLeft: 8, capReached: false },
    } as never)
    renderThread()

    await screen.findByTestId('chat-queue-starters')

    expect(screen.queryByTestId('chat-queue-delete-last')).toBeNull()
  })
})
