// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import type { CardProposal, PendingKnowledgeBitForReview } from '@post-anki/shared'

import { KnowledgeBitChatPanel } from './knowledge-bit-chat-panel'
import {
  askKnowledgeBitChat,
  createKnowledgeItemFromChat,
  draftKnowledgeBitChat,
} from './knowledge-bit-chat.api'

vi.mock('./knowledge-bit-chat.api', () => ({
  askKnowledgeBitChat: vi.fn(),
  draftKnowledgeBitChat: vi.fn(),
  createKnowledgeItemFromChat: vi.fn(),
}))

const mockedAsk = vi.mocked(askKnowledgeBitChat)
const mockedDraft = vi.mocked(draftKnowledgeBitChat)
const mockedCreate = vi.mocked(createKnowledgeItemFromChat)

const card: CardProposal = {
  front: 'What is a closure?',
  back: 'A function plus its scope.',
  sources: [],
  usedWebSearch: false,
}

const created: PendingKnowledgeBitForReview = {
  id: 'kb-new',
  body: 'Q\nA',
  background: null,
  variants: [],
  feedback: null,
  origin: 'manual',
  isAiGenerated: false,
  sourceLinks: [],
}

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
})

async function openWithOneExchange(onReplaceAccepted?: () => void) {
  const user = userEvent.setup()
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })

  mockedAsk.mockResolvedValue({ reply: 'It is vague.' })
  render(
    <QueryClientProvider client={queryClient}>
      <KnowledgeBitChatPanel knowledgeBitId="bit-1" onReplaceAccepted={onReplaceAccepted} />
    </QueryClientProvider>,
  )
  await user.click(screen.getByTestId('knowledge-bit-chat-open'))
  await user.type(screen.getByTestId('knowledge-bit-chat-input'), 'why is this bad?')
  await user.click(screen.getByTestId('knowledge-bit-chat-send'))
  await screen.findByText('It is vague.')

  return user
}

describe('replacement card suggestion in review chat', () => {
  it('should not offer a replacement before any exchange has happened', async () => {
    const user = userEvent.setup()
    const queryClient = new QueryClient()

    render(
      <QueryClientProvider client={queryClient}>
        <KnowledgeBitChatPanel knowledgeBitId="bit-1" onReplaceAccepted={vi.fn()} />
      </QueryClientProvider>,
    )
    await user.click(screen.getByTestId('knowledge-bit-chat-open'))

    expect(screen.queryByTestId('knowledge-bit-chat-replacement-chip')).toBeNull()
  })

  it('should create a new card and hand control back so the old card is suspended when accepted', async () => {
    const onReplaceAccepted = vi.fn()
    const user = await openWithOneExchange(onReplaceAccepted)

    mockedDraft.mockResolvedValue({ sources: [], card })
    mockedCreate.mockResolvedValue(created)
    await user.click(screen.getByTestId('knowledge-bit-chat-replacement-chip'))
    await screen.findByTestId('knowledge-bit-chat-replacement-proposal')
    await user.click(screen.getByTestId('knowledge-bit-chat-replacement-accept'))

    await waitFor(() => expect(onReplaceAccepted).toHaveBeenCalledTimes(1))
    expect(mockedCreate).toHaveBeenCalledWith({
      data: expect.objectContaining({
        knowledgeBitId: 'bit-1',
        front: card.front,
        back: card.back,
      }),
    })
    expect(mockedDraft).toHaveBeenCalledWith({
      data: expect.objectContaining({ knowledgeBitId: 'bit-1', mode: 'create' }),
    })
  })

  it('should leave the old card untouched when the proposal is ignored', async () => {
    const onReplaceAccepted = vi.fn()
    const user = await openWithOneExchange(onReplaceAccepted)

    mockedDraft.mockResolvedValue({ sources: [], card })
    await user.click(screen.getByTestId('knowledge-bit-chat-replacement-chip'))
    await user.click(await screen.findByTestId('knowledge-bit-chat-replacement-ignore'))

    expect(mockedCreate).not.toHaveBeenCalled()
    expect(onReplaceAccepted).not.toHaveBeenCalled()
    expect(screen.getByTestId('knowledge-bit-chat-replacement-chip')).toBeTruthy()
  })

  it('should keep the old card active and show an error when saving the replacement fails', async () => {
    const onReplaceAccepted = vi.fn()
    const user = await openWithOneExchange(onReplaceAccepted)

    mockedDraft.mockResolvedValue({ sources: [], card })
    mockedCreate.mockRejectedValue(new Error('boom'))
    await user.click(screen.getByTestId('knowledge-bit-chat-replacement-chip'))
    await user.click(await screen.findByTestId('knowledge-bit-chat-replacement-accept'))

    expect(await screen.findByTestId('knowledge-bit-chat-replacement-error')).toBeTruthy()
    expect(onReplaceAccepted).not.toHaveBeenCalled()
  })

  it('should tell the learner when drafting a replacement fails', async () => {
    const user = await openWithOneExchange(vi.fn())

    mockedDraft.mockRejectedValue(new Error('down'))
    await user.click(screen.getByTestId('knowledge-bit-chat-replacement-chip'))

    expect(await screen.findByTestId('knowledge-bit-chat-replacement-draft-error')).toBeTruthy()
  })
})
