// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import type { ChatQueueProposal } from '@post-anki/shared'

vi.mock('./chat-queue.api', () => ({ acceptChatQueueProposal: vi.fn(), rejectChatQueueProposal: vi.fn() }))
vi.mock('../knowledge-bit/knowledge-bit-review-events', () => ({ notifyPendingReviewChanged: vi.fn() }))

import { notifyPendingReviewChanged } from '../knowledge-bit/knowledge-bit-review-events'
import { acceptChatQueueProposal, rejectChatQueueProposal } from './chat-queue.api'
import { ChatQueueProposals } from './chat-queue-proposals'
import { useChatProposals } from './use-chat-proposals'

const initial: ChatQueueProposal[] = [
  { index: 0, kind: 'create', front: 'What is X?', back: 'X is Y.', example: 'e.g. Z', status: 'pending' },
  { index: 1, kind: 'update', front: 'Why Q?', back: 'Because.', status: 'pending' },
]

function Harness({ seq, proposals = initial }: { seq: number | undefined; proposals?: ChatQueueProposal[] }) {
  const state = useChatProposals('b1', { onDecided: onDecided, onRejected })

  return (
    <ChatQueueProposals
      lineId="a-1"
      seq={seq}
      proposals={proposals}
      statusOf={state.statusOf}
      onDecide={(lineId, lineSeq, proposal, decision) => void state.decide(lineId, lineSeq, proposal, decision)}
    />
  )
}

const onDecided = vi.fn()
const onRejected = vi.fn()

function swipe(element: HTMLElement, from: number, to: number) {
  fireEvent.touchStart(element, { touches: [{ clientX: from, clientY: 50 }], changedTouches: [{ clientX: from, clientY: 50 }] })
  fireEvent.touchEnd(element, { touches: [], changedTouches: [{ clientX: to, clientY: 52 }] })
}

describe('ChatQueueProposals', () => {
  beforeEach(() => {
    vi.mocked(acceptChatQueueProposal).mockReset()
    vi.mocked(rejectChatQueueProposal).mockReset()
    vi.mocked(notifyPendingReviewChanged).mockReset()
    onDecided.mockReset()
    onRejected.mockReset()
  })

  afterEach(cleanup)

  it('should label each proposal as a new card or an update to this card', () => {
    render(<Harness seq={2} />)

    expect(screen.getByText('New card')).toBeTruthy()
    expect(screen.getByText('Update to this card')).toBeTruthy()
    expect(screen.getByText('e.g. Z')).toBeTruthy()
  })

  it('should save nothing until the learner uses a button or a swipe', () => {
    render(<Harness seq={2} />)

    swipe(screen.getByTestId('chat-queue-proposal-0'), 100, 130)

    expect(acceptChatQueueProposal).not.toHaveBeenCalled()
    expect(rejectChatQueueProposal).not.toHaveBeenCalled()
  })

  it('should accept with one call on a right swipe and confirm', async () => {
    vi.mocked(acceptChatQueueProposal).mockResolvedValue({ ok: true, data: { ok: true, status: 'accepted', savedCardId: 'c1' } })

    render(<Harness seq={2} />)
    swipe(screen.getByTestId('chat-queue-proposal-0'), 100, 220)

    await waitFor(() => expect(onDecided).toHaveBeenCalledWith('a-1', 0, { status: 'accepted', savedCardId: 'c1' }))
    expect(acceptChatQueueProposal).toHaveBeenCalledTimes(1)
    expect(acceptChatQueueProposal).toHaveBeenCalledWith({ data: { bitId: 'b1', seq: 2, index: 0 } })
    expect(notifyPendingReviewChanged).toHaveBeenCalledTimes(1)
  })

  it('should reject with one call on a left swipe and tell the thread to ask what is wrong', async () => {
    vi.mocked(rejectChatQueueProposal).mockResolvedValue({ ok: true, data: { ok: true, status: 'rejected' } })

    render(<Harness seq={2} />)
    swipe(screen.getByTestId('chat-queue-proposal-1'), 300, 150)

    await waitFor(() => expect(onRejected).toHaveBeenCalledTimes(1))
    expect(rejectChatQueueProposal).toHaveBeenCalledWith({ data: { bitId: 'b1', seq: 2, index: 1 } })
    expect(acceptChatQueueProposal).not.toHaveBeenCalled()
    expect(notifyPendingReviewChanged).not.toHaveBeenCalled()
  })

  it('should make the same calls from the Accept and Reject buttons', async () => {
    vi.mocked(acceptChatQueueProposal).mockResolvedValue({ ok: true, data: { ok: true, status: 'accepted' } })
    vi.mocked(rejectChatQueueProposal).mockResolvedValue({ ok: true, data: { ok: true, status: 'rejected' } })

    render(<Harness seq={2} />)
    fireEvent.click(screen.getByTestId('chat-queue-proposal-accept-0'))
    fireEvent.click(screen.getByTestId('chat-queue-proposal-reject-1'))

    await waitFor(() => expect(onDecided).toHaveBeenCalledTimes(2))
    expect(acceptChatQueueProposal).toHaveBeenCalledWith({ data: { bitId: 'b1', seq: 2, index: 0 } })
    expect(rejectChatQueueProposal).toHaveBeenCalledWith({ data: { bitId: 'b1', seq: 2, index: 1 } })
  })

  it('should ignore a second gesture while the first decision is still in flight', async () => {
    let finish: (value: never) => void = () => undefined

    vi.mocked(acceptChatQueueProposal).mockReturnValue(new Promise((resolve) => { finish = resolve as never }))

    render(<Harness seq={2} />)
    swipe(screen.getByTestId('chat-queue-proposal-0'), 100, 220)
    swipe(screen.getByTestId('chat-queue-proposal-0'), 100, 220)
    fireEvent.click(screen.getByTestId('chat-queue-proposal-accept-0'))

    expect(acceptChatQueueProposal).toHaveBeenCalledTimes(1)
    finish({ ok: true, data: { ok: true, status: 'accepted' } } as never)
    await waitFor(() => expect(onDecided).toHaveBeenCalledTimes(1))
  })

  it('should offer no decision on a proposal that was already decided', () => {
    render(<Harness seq={2} proposals={[{ ...initial[0]!, status: 'accepted', savedCardId: 'c1' }, { ...initial[1]!, status: 'rejected' }]} />)

    expect(screen.getByText('Added to approved cards')).toBeTruthy()
    expect(screen.getByText('Rejected')).toBeTruthy()
    expect(screen.queryByTestId('chat-queue-proposal-accept-0')).toBeNull()
    swipe(screen.getByTestId('chat-queue-proposal-1'), 100, 220)
    expect(acceptChatQueueProposal).not.toHaveBeenCalled()
  })

  it('should keep the buttons disabled until the reply has a sequence number', () => {
    render(<Harness seq={undefined} />)

    expect((screen.getByTestId('chat-queue-proposal-accept-0') as HTMLButtonElement).disabled).toBe(true)
    fireEvent.click(screen.getByTestId('chat-queue-proposal-accept-0'))
    expect(acceptChatQueueProposal).not.toHaveBeenCalled()
  })

  it('should show an error and allow another try when deciding fails', async () => {
    vi.mocked(acceptChatQueueProposal).mockResolvedValueOnce({ ok: false, failure: 'offline' })

    render(<Harness seq={2} />)
    fireEvent.click(screen.getByTestId('chat-queue-proposal-accept-0'))

    await waitFor(() => expect(screen.getByTestId('chat-queue-proposal-error-0')).toBeTruthy())
    expect((screen.getByTestId('chat-queue-proposal-accept-0') as HTMLButtonElement).disabled).toBe(false)
    expect(onDecided).not.toHaveBeenCalled()
  })
})
