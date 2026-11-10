// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { ChatQueueKnowledgeBit, ChatQueueProposal } from '@post-anki/shared'

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

import { acceptChatQueueProposal, getChatQueueThread } from './chat-queue.api'
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

function threadWith(proposals: ChatQueueProposal[]) {
  return {
    messages: [
      { seq: 1, role: 'user', text: 'make a card' },
      { seq: 2, role: 'assistant', text: 'here you go', proposals },
    ],
    turnsLeft: 5,
    capReached: false,
  }
}

const pending: ChatQueueProposal = { index: 0, kind: 'create', front: 'What is X?', back: 'X is Y.', status: 'pending' }

function renderThread() {
  return render(<ChatQueueThread item={bit} onBack={vi.fn()} onResolved={vi.fn()} onSnoozeChanged={vi.fn()} />)
}

beforeEach(() => {
  window.localStorage.clear()
})

afterEach(() => {
  cleanup()
  vi.resetAllMocks()
})

describe('thread controls next to proposals', () => {
  it('should disable Retry and Delete last exchange while a proposal is saving', async () => {
    vi.mocked(getChatQueueThread).mockResolvedValue({ ok: true, data: threadWith([pending]) } as never)
    vi.mocked(acceptChatQueueProposal).mockReturnValue(new Promise(() => undefined) as never)
    renderThread()

    expect((await screen.findByTestId('chat-queue-retry') as HTMLButtonElement).disabled).toBe(false)
    await userEvent.click(screen.getByTestId('chat-queue-proposal-accept-0'))

    await waitFor(() => expect((screen.getByTestId('chat-queue-retry') as HTMLButtonElement).disabled).toBe(true))
    expect((screen.getByTestId('chat-queue-delete-last') as HTMLButtonElement).disabled).toBe(true)
  })

  it('should keep Retry and Delete last exchange disabled once a proposal is accepted so the saved card cannot be proposed twice', async () => {
    vi.mocked(getChatQueueThread).mockResolvedValue({
      ok: true,
      data: threadWith([{ ...pending, status: 'accepted', savedCardId: 'c1' }]),
    } as never)
    renderThread()

    expect((await screen.findByTestId('chat-queue-retry') as HTMLButtonElement).disabled).toBe(true)
    expect((screen.getByTestId('chat-queue-delete-last') as HTMLButtonElement).disabled).toBe(true)
  })

  it('should keep Retry and Delete usable when the proposal was only rejected', async () => {
    vi.mocked(getChatQueueThread).mockResolvedValue({
      ok: true,
      data: threadWith([{ ...pending, status: 'rejected' }]),
    } as never)
    renderThread()

    expect((await screen.findByTestId('chat-queue-retry') as HTMLButtonElement).disabled).toBe(false)
    expect((screen.getByTestId('chat-queue-delete-last') as HTMLButtonElement).disabled).toBe(false)
  })

  it('should give proposal buttons names that differ from the card-level Accept and Reject', async () => {
    vi.mocked(getChatQueueThread).mockResolvedValue({ ok: true, data: threadWith([pending]) } as never)
    renderThread()

    const group = await screen.findByRole('group', { name: 'New card: What is X?' })

    expect(within(group).getByRole('button', { name: 'Accept new card: What is X?' })).toBeTruthy()
    expect(within(group).getByRole('button', { name: 'Reject new card: What is X?' })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Cancel chat' })).toBe(screen.getByTestId('chat-queue-cancel'))
  })

  it('should announce the decision and move focus to it after Accept', async () => {
    vi.mocked(getChatQueueThread).mockResolvedValue({ ok: true, data: threadWith([pending]) } as never)
    vi.mocked(acceptChatQueueProposal).mockResolvedValue({
      ok: true,
      data: { ok: true, status: 'accepted', savedCardId: 'c1' },
    } as never)
    renderThread()

    await userEvent.click(await screen.findByRole('button', { name: 'Accept new card: What is X?' }))

    await waitFor(() => expect(document.activeElement).toBe(screen.getByTestId('chat-queue-proposal-accepted-0')))
    expect(screen.getByTestId('chat-queue-proposal-accepted-0').getAttribute('role')).toBe('status')
  })
})
