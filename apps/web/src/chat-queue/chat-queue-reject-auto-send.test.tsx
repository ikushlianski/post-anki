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
  acceptChatQueueProposal: vi.fn(),
  rejectChatQueueProposal: vi.fn(),
}))
vi.mock('../knowledge-bit/knowledge-bit-review-events', () => ({ notifyPendingReviewChanged: vi.fn() }))

import { getChatQueueThread, rejectChatQueueProposal, sendChatQueueMessage } from './chat-queue.api'
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

function thread(turnsLeft = 5, capReached = false) {
  return {
    ok: true,
    data: {
      messages: [
        { seq: 1, role: 'user', text: 'make a card' },
        {
          seq: 2,
          role: 'assistant',
          text: 'here you go',
          proposals: [{ index: 0, kind: 'create', front: 'What is X?', back: 'X is Y.', status: 'pending' }],
        },
      ],
      turnsLeft,
      capReached,
    },
  } as never
}

function renderThread() {
  return render(<ChatQueueThread item={bit} onBack={vi.fn()} onResolved={vi.fn()} onSnoozeChanged={vi.fn()} />)
}

beforeEach(() => {
  window.localStorage.clear()
  vi.mocked(rejectChatQueueProposal).mockResolvedValue({ ok: true, data: { ok: true, status: 'rejected' } } as never)
})

afterEach(() => {
  cleanup()
  vi.resetAllMocks()
})

describe('rejecting a proposed card', () => {
  it('should send exactly one message with a deterministic id so replays are idempotent', async () => {
    vi.mocked(getChatQueueThread).mockResolvedValue(thread())
    vi.mocked(sendChatQueueMessage).mockResolvedValue({
      ok: true,
      data: { reply: 'Revised', replySeq: 4, turnsLeft: 4, capReached: false },
    } as never)
    renderThread()

    const button = await screen.findByTestId('chat-queue-proposal-reject-0')
    await userEvent.dblClick(button)

    expect(await screen.findByText('Revised')).not.toBeNull()
    expect(sendChatQueueMessage).toHaveBeenCalledTimes(1)
    expect(sendChatQueueMessage).toHaveBeenCalledWith({
      data: {
        bitId: 'a',
        message: { clientMessageId: 'reject:a:2:0', message: 'I rejected your proposed card: What is X?.' },
      },
    })
  })

  it('should not send when the thread is capped', async () => {
    vi.mocked(getChatQueueThread).mockResolvedValue(thread(0, true))
    renderThread()

    await userEvent.click(await screen.findByTestId('chat-queue-proposal-reject-0'))

    await waitFor(() => expect(rejectChatQueueProposal).toHaveBeenCalledTimes(1))
    expect(sendChatQueueMessage).not.toHaveBeenCalled()
  })

  it('should not send a second message while a turn is already in flight', async () => {
    vi.mocked(getChatQueueThread).mockResolvedValue(thread())
    vi.mocked(sendChatQueueMessage).mockReturnValue(new Promise(() => undefined) as never)
    renderThread()

    await userEvent.type(await screen.findByLabelText('Ask about this card'), 'hello')
    await userEvent.click(screen.getByTestId('chat-queue-send'))
    await waitFor(() => expect(sendChatQueueMessage).toHaveBeenCalledTimes(1))

    const reject = screen.queryByTestId('chat-queue-proposal-reject-0')

    if (reject) {
      await userEvent.click(reject)
    }

    expect(sendChatQueueMessage).toHaveBeenCalledTimes(1)
  })
})
