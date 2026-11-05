// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import type { RelatedCardSuggestion } from '@post-anki/shared'

vi.mock('./chat-queue.api', () => ({ createCardFromChatMessage: vi.fn() }))
vi.mock('../knowledge-bit/knowledge-bit-review-events', () => ({ notifyPendingReviewChanged: vi.fn() }))

import { notifyPendingReviewChanged } from '../knowledge-bit/knowledge-bit-review-events'
import { createCardFromChatMessage } from './chat-queue.api'
import { ChatQueueProposals } from './chat-queue-proposals'
import { useChatProposals } from './use-chat-proposals'

const proposals: RelatedCardSuggestion[] = [
  { front: 'What is X?', back: 'X is Y.', example: 'e.g. Z', origin: 'own', sources: [] },
  { front: 'Why Q?', back: 'Because.', origin: 'own', sources: [] },
]

function Harness({ seq }: { seq: number | undefined }) {
  const state = useChatProposals('b1')

  return (
    <ChatQueueProposals
      lineId="a-1"
      seq={seq}
      proposals={proposals}
      statusOf={state.statusOf}
      onApprove={(lineId, lineSeq, index, proposal) => void state.approve(lineId, lineSeq, index, proposal)}
    />
  )
}

describe('ChatQueueProposals', () => {
  beforeEach(() => {
    vi.mocked(createCardFromChatMessage).mockReset()
    vi.mocked(notifyPendingReviewChanged).mockReset()
  })

  afterEach(cleanup)

  it('should show each proposed card with its example and the hint to keep chatting', () => {
    render(<Harness seq={2} />)

    expect(screen.getByText('What is X?')).toBeTruthy()
    expect(screen.getByText('e.g. Z')).toBeTruthy()
    expect(screen.getByText('Why Q?')).toBeTruthy()
    expect(screen.getByText('Or keep chatting to refine')).toBeTruthy()
  })

  it('should approve the card straight into approved cards and confirm it', async () => {
    vi.mocked(createCardFromChatMessage).mockResolvedValue({ ok: true, data: { ok: true, id: 'n' } } as never)

    render(<Harness seq={2} />)
    fireEvent.click(screen.getByTestId('chat-queue-proposal-approve-0'))

    await waitFor(() => expect(screen.getByText('Added to approved cards')).toBeTruthy())
    expect(createCardFromChatMessage).toHaveBeenCalledWith({
      data: { bitId: 'b1', seq: 2, card: { front: 'What is X?', back: 'X is Y.', example: 'e.g. Z', approve: true } },
    })
    expect(notifyPendingReviewChanged).toHaveBeenCalledTimes(1)
    expect(screen.getByTestId('chat-queue-proposal-approve-1')).toBeTruthy()
  })

  it('should keep Approve disabled until the reply has a sequence number', () => {
    render(<Harness seq={undefined} />)

    expect((screen.getByTestId('chat-queue-proposal-approve-0') as HTMLButtonElement).disabled).toBe(true)
    fireEvent.click(screen.getByTestId('chat-queue-proposal-approve-0'))
    expect(createCardFromChatMessage).not.toHaveBeenCalled()
  })

  it('should show an error and allow another try when approving fails', async () => {
    vi.mocked(createCardFromChatMessage).mockResolvedValueOnce({ ok: false, failure: 'offline' } as never)

    render(<Harness seq={2} />)
    fireEvent.click(screen.getByTestId('chat-queue-proposal-approve-0'))

    await waitFor(() => expect(screen.getByTestId('chat-queue-proposal-error-0')).toBeTruthy())
    expect((screen.getByTestId('chat-queue-proposal-approve-0') as HTMLButtonElement).disabled).toBe(false)
    expect(notifyPendingReviewChanged).not.toHaveBeenCalled()
  })
})
