// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { ChatQueueKnowledgeBit, ChatQueueProposal } from '@post-anki/shared'

vi.mock('./chat-queue.api', () => ({
  getChatQueueThread: vi.fn(),
  sendChatQueueMessage: vi.fn(),
  deleteLastChatExchange: vi.fn(),
  returnFromChatQueue: vi.fn(),
  approveFromChatQueue: vi.fn(),
  cancelChatQueueThread: vi.fn(),
  rejectFromChatQueue: vi.fn(),
  saveChatQueueRejectReason: vi.fn(),
  snoozeChatQueueCard: vi.fn(),
  unsnoozeChatQueueCard: vi.fn(),
  acceptChatQueueProposal: vi.fn(),
  rejectChatQueueProposal: vi.fn(),
}))
vi.mock('../knowledge-bit/knowledge-bit-review-events', () => ({ notifyPendingReviewChanged: vi.fn() }))

import {
  approveFromChatQueue,
  cancelChatQueueThread,
  getChatQueueThread,
} from './chat-queue.api'
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

const proposal: ChatQueueProposal = {
  index: 0,
  kind: 'create',
  front: 'What is X?',
  back: 'X is Y.',
  status: 'pending',
}

function threadWith(proposals: ChatQueueProposal[]) {
  return {
    ok: true,
    data: {
      messages: [
        { seq: 1, role: 'user', text: 'make a card' },
        { seq: 2, role: 'assistant', text: 'here you go', proposals },
      ],
      turnsLeft: 5,
      capReached: false,
    },
  } as never
}

function renderThread(onResolved = vi.fn()) {
  render(<ChatQueueThread item={bit} onBack={vi.fn()} onResolved={onResolved} onSnoozeChanged={vi.fn()} />)

  return onResolved
}

beforeEach(() => {
  window.localStorage.clear()
})

afterEach(() => {
  cleanup()
  vi.resetAllMocks()
})

describe('Finish chat and Cancel chat', () => {
  it('should offer Cancel chat when no card was accepted in the conversation', async () => {
    vi.mocked(getChatQueueThread).mockResolvedValue(threadWith([{ ...proposal, status: 'rejected' }]))
    renderThread()

    expect(await screen.findByTestId('chat-queue-cancel')).toBeTruthy()
    expect(screen.queryByTestId('chat-queue-finish')).toBeNull()
  })

  it('should offer Finish chat once a proposed card was accepted', async () => {
    vi.mocked(getChatQueueThread).mockResolvedValue(
      threadWith([{ ...proposal, status: 'accepted', savedCardId: 'c1' }]),
    )
    renderThread()

    expect(await screen.findByTestId('chat-queue-finish')).toBeTruthy()
    expect(screen.queryByTestId('chat-queue-cancel')).toBeNull()
  })

  it('should ask before deleting a conversation and keep it when the user changes their mind', async () => {
    vi.mocked(getChatQueueThread).mockResolvedValue(threadWith([]))
    renderThread()

    await userEvent.click(await screen.findByTestId('chat-queue-cancel'))

    expect(cancelChatQueueThread).not.toHaveBeenCalled()

    await userEvent.click(screen.getByTestId('chat-queue-cancel-keep'))

    expect(screen.queryByTestId('chat-queue-cancel-confirm')).toBeNull()
    expect(cancelChatQueueThread).not.toHaveBeenCalled()
  })

  it('should cancel at once when the conversation is empty', async () => {
    vi.mocked(getChatQueueThread).mockResolvedValue({
      ok: true,
      data: { messages: [], turnsLeft: 6, capReached: false },
    } as never)
    vi.mocked(cancelChatQueueThread).mockResolvedValue({ ok: true, data: { ok: true } } as never)
    const onResolved = renderThread()

    await userEvent.click(await screen.findByTestId('chat-queue-cancel'))

    await waitFor(() => expect(onResolved).toHaveBeenCalledWith('a'))
  })

  it('should delete the conversation and send the card back to triage once Cancel chat is confirmed', async () => {
    vi.mocked(getChatQueueThread).mockResolvedValue(threadWith([]))
    vi.mocked(cancelChatQueueThread).mockResolvedValue({ ok: true, data: { ok: true } } as never)
    const onResolved = renderThread()

    await userEvent.click(await screen.findByTestId('chat-queue-cancel'))
    await userEvent.click(screen.getByTestId('chat-queue-cancel-confirm'))

    await waitFor(() => expect(onResolved).toHaveBeenCalledWith('a'))
    expect(cancelChatQueueThread).toHaveBeenCalledWith({ data: { bitId: 'a' } })
    expect(approveFromChatQueue).not.toHaveBeenCalled()
  })

  it('should approve the card on Finish chat', async () => {
    vi.mocked(getChatQueueThread).mockResolvedValue(
      threadWith([{ ...proposal, status: 'accepted', savedCardId: 'c1' }]),
    )
    vi.mocked(approveFromChatQueue).mockResolvedValue({ ok: true, data: { ok: true } } as never)
    const onResolved = renderThread()

    await userEvent.click(await screen.findByTestId('chat-queue-finish'))

    await waitFor(() => expect(onResolved).toHaveBeenCalledWith('a'))
    expect(approveFromChatQueue).toHaveBeenCalledWith({ data: { bitId: 'a' } })
    expect(cancelChatQueueThread).not.toHaveBeenCalled()
  })

  it('should keep Back to triage next to the finish button', async () => {
    vi.mocked(getChatQueueThread).mockResolvedValue(threadWith([]))
    renderThread()

    expect(await screen.findByTestId('chat-queue-back')).toBeTruthy()
  })
})
