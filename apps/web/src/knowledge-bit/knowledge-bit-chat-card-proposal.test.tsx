// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import type { CardProposal, PendingKnowledgeBitForReview } from '@post-anki/shared'

import { KnowledgeBitChatPanel } from './knowledge-bit-chat-panel'
import {
  askKnowledgeBitChat,
  createKnowledgeItemFromChat,
  draftKnowledgeBitChat,
} from './knowledge-bit-chat.api'
import { notifyPendingReviewChanged } from './knowledge-bit-review-events'

vi.mock('./knowledge-bit-chat.api', () => ({
  askKnowledgeBitChat: vi.fn(),
  draftKnowledgeBitChat: vi.fn(),
  createKnowledgeItemFromChat: vi.fn(),
}))

vi.mock('./knowledge-bit-review-events', () => ({
  notifyPendingReviewChanged: vi.fn(),
}))

const mockedAsk = vi.mocked(askKnowledgeBitChat)
const mockedDraft = vi.mocked(draftKnowledgeBitChat)
const mockedCreate = vi.mocked(createKnowledgeItemFromChat)
const mockedNotify = vi.mocked(notifyPendingReviewChanged)

const createdItem: PendingKnowledgeBitForReview = {
  id: 'kb-new',
  body: 'Q\nA',
  background: null,
  variants: [],
  feedback: null,
  origin: 'manual',
  isAiGenerated: false,
  sourceLinks: [],
}

const card: CardProposal = {
  front: 'What is a closure?',
  back: 'A function plus its scope.',
  example: 'const add = (a) => (b) => a + b',
  sources: [],
  usedWebSearch: false,
}

function draftResult(next: CardProposal) {
  return { sources: [], card: next }
}

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
})

async function openAndRequestCard(message = 'card: closures') {
  const user = userEvent.setup()
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })

  render(
    <QueryClientProvider client={queryClient}>
      <KnowledgeBitChatPanel knowledgeBitId="bit-1" />
    </QueryClientProvider>,
  )

  await user.click(screen.getByTestId('knowledge-bit-chat-open'))
  await user.type(screen.getByTestId('knowledge-bit-chat-input'), message)
  await user.click(screen.getByTestId('knowledge-bit-chat-send'))

  return user
}

describe('KnowledgeBitChatPanel card proposals', () => {
  it('should show an inline proposal when the learner dictates a card', async () => {
    mockedDraft.mockResolvedValue(draftResult(card))

    await openAndRequestCard('Make a card: closures')

    expect(await screen.findByTestId('knowledge-bit-chat-card-proposal')).toBeTruthy()
    expect(screen.getByTestId('knowledge-bit-chat-card-front').textContent).toBe(card.front)
    expect(screen.getByTestId('knowledge-bit-chat-card-example').textContent).toBe(card.example)
    expect(mockedDraft).toHaveBeenCalledWith({
      data: expect.objectContaining({
        knowledgeBitId: 'bit-1',
        mode: 'create',
        instruction: 'Make a card: closures',
        allowWebSearch: false,
      }),
    })
    expect(mockedAsk).not.toHaveBeenCalled()
  })

  it('should save the approved card with its example and show it waiting in review', async () => {
    mockedDraft.mockResolvedValue(draftResult(card))
    mockedCreate.mockResolvedValue(createdItem)

    const user = await openAndRequestCard()

    await user.click(await screen.findByTestId('knowledge-bit-chat-card-approve'))

    expect(await screen.findByText('Saved, waiting in review')).toBeTruthy()
    expect(mockedCreate).toHaveBeenCalledWith({
      data: {
        knowledgeBitId: 'bit-1',
        front: card.front,
        back: card.back,
        example: card.example,
        aiGenerated: false,
        sourceLinks: [],
      },
    })
    expect(mockedNotify).toHaveBeenCalledTimes(1)
  })

  it('should store nothing when the learner rejects the proposal', async () => {
    mockedDraft.mockResolvedValue(draftResult(card))

    const user = await openAndRequestCard()

    await user.click(await screen.findByTestId('knowledge-bit-chat-card-reject'))

    expect(screen.getByText('Discarded')).toBeTruthy()
    expect(mockedCreate).not.toHaveBeenCalled()
    expect(mockedNotify).not.toHaveBeenCalled()
  })

  it('should save the edited values when the learner edits before saving', async () => {
    mockedDraft.mockResolvedValue(draftResult(card))
    mockedCreate.mockResolvedValue(createdItem)

    const user = await openAndRequestCard()

    await user.click(await screen.findByTestId('knowledge-bit-chat-card-edit'))
    await user.clear(screen.getByTestId('knowledge-bit-chat-card-edit-back'))
    await user.type(screen.getByTestId('knowledge-bit-chat-card-edit-back'), 'Edited back')
    await user.clear(screen.getByTestId('knowledge-bit-chat-card-edit-example'))
    await user.click(screen.getByTestId('knowledge-bit-chat-card-edit-save'))

    expect(await screen.findByText('Saved, waiting in review')).toBeTruthy()
    expect(mockedCreate).toHaveBeenCalledWith({
      data: {
        knowledgeBitId: 'bit-1',
        front: card.front,
        back: 'Edited back',
        example: undefined,
        aiGenerated: false,
        sourceLinks: [],
      },
    })
  })

  it('should disable older proposal buttons once a revision is posted', async () => {
    const revised: CardProposal = { ...card, back: 'Shorter back.' }

    mockedDraft
      .mockResolvedValueOnce(draftResult(card))
      .mockResolvedValueOnce(draftResult(revised))

    const user = await openAndRequestCard()

    await user.type(await screen.findByTestId('knowledge-bit-chat-card-revise-input'), 'shorter')
    await user.click(screen.getByTestId('knowledge-bit-chat-card-revise'))

    await screen.findByText('Shorter back.')

    expect(mockedDraft).toHaveBeenLastCalledWith({
      data: expect.objectContaining({ mode: 'edit', instruction: 'shorter', previous: card }),
    })

    const approveButtons = screen.getAllByTestId('knowledge-bit-chat-card-approve')

    expect(approveButtons).toHaveLength(2)
    expect((approveButtons[0] as HTMLButtonElement).disabled).toBe(true)
    expect((approveButtons[1] as HTMLButtonElement).disabled).toBe(false)
  })

  it('should answer a plain question through the normal chat without drafting a card', async () => {
    mockedAsk.mockResolvedValue({ reply: 'It keeps its scope.' })

    await openAndRequestCard('What is a closure?')

    expect(await screen.findByText('It keeps its scope.')).toBeTruthy()
    expect(mockedDraft).not.toHaveBeenCalled()
    expect(screen.queryByTestId('knowledge-bit-chat-card-proposal')).toBeFalsy()
  })

  it('should show the AI label only when web research was used', async () => {
    mockedDraft.mockResolvedValueOnce(draftResult(card))

    await openAndRequestCard()
    await screen.findByTestId('knowledge-bit-chat-card-proposal')

    expect(screen.queryByTestId('ai-label-badge-card')).toBeFalsy()

    cleanup()
    mockedDraft.mockResolvedValueOnce(
      draftResult({ ...card, usedWebSearch: true, sources: ['https://example.com/a'] }),
    )

    await openAndRequestCard()

    expect(await screen.findByTestId('ai-label-badge-card')).toBeTruthy()
  })
})
