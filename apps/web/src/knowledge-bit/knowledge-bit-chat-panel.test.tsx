// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'

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

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
})

function renderHarness(knowledgeBitId = 'bit-1') {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })

  return render(
    <QueryClientProvider client={queryClient}>
      <KnowledgeBitChatPanel knowledgeBitId={knowledgeBitId} />
    </QueryClientProvider>,
  )
}

describe('KnowledgeBitChatPanel', () => {
  it('answers a question about the scoped knowledge bit', async () => {
    mockedAsk.mockResolvedValue({ reply: 'This bit explains closures.' })

    const user = userEvent.setup()

    renderHarness('bit-1')

    await user.click(screen.getByTestId('knowledge-bit-chat-open'))
    await user.type(screen.getByTestId('knowledge-bit-chat-input'), 'What does this mean?')
    await user.click(screen.getByTestId('knowledge-bit-chat-send'))

    expect(await screen.findByText('This bit explains closures.')).toBeTruthy()
    expect(mockedAsk).toHaveBeenCalledWith({
      data: {
        knowledgeBitId: 'bit-1',
        message: 'What does this mean?',
        transcript: [],
        allowGeneralKnowledge: false,
      },
    })
  })

  it('sends allowGeneralKnowledge: true only after the learner turns the toggle on', async () => {
    mockedAsk.mockResolvedValue({ reply: 'Beyond this item: here is more context.' })

    const user = userEvent.setup()

    renderHarness('bit-1')

    await user.click(screen.getByTestId('knowledge-bit-chat-open'))
    await user.click(screen.getByTestId('knowledge-bit-chat-allow-general-knowledge'))
    await user.type(screen.getByTestId('knowledge-bit-chat-input'), 'Tell me more')
    await user.click(screen.getByTestId('knowledge-bit-chat-send'))

    await screen.findByText('Beyond this item: here is more context.')

    expect(mockedAsk).toHaveBeenCalledWith({
      data: {
        knowledgeBitId: 'bit-1',
        message: 'Tell me more',
        transcript: [],
        allowGeneralKnowledge: true,
      },
    })
  })

  it('falls back to a plain retry message when the endpoint returns nothing', async () => {
    mockedAsk.mockResolvedValue(null)

    const user = userEvent.setup()

    renderHarness('bit-1')

    await user.click(screen.getByTestId('knowledge-bit-chat-open'))
    await user.type(screen.getByTestId('knowledge-bit-chat-input'), 'What is hoisting?')
    await user.click(screen.getByTestId('knowledge-bit-chat-send'))

    expect(
      await screen.findByText("I couldn't reach the tutor right now — try again."),
    ).toBeTruthy()
  })

  it('should show a fallback message and clear the typing indicator when the request fails', async () => {
    mockedAsk.mockRejectedValue(new Error('network error'))

    const user = userEvent.setup()

    renderHarness('bit-1')

    await user.click(screen.getByTestId('knowledge-bit-chat-open'))
    await user.type(screen.getByTestId('knowledge-bit-chat-input'), 'What is hoisting?')
    await user.click(screen.getByTestId('knowledge-bit-chat-send'))

    expect(
      await screen.findByText("I couldn't reach the tutor right now — try again."),
    ).toBeTruthy()
    expect(screen.queryByTestId('knowledge-bit-chat-typing-indicator')).toBeFalsy()
  })

  it('should let the single web research checkbox control the chip draft', async () => {
    mockedAsk.mockResolvedValue({ reply: 'A closure keeps its scope.' })
    mockedDraft.mockResolvedValue({
      sources: [],
      card: { front: 'Q', back: 'A', sources: ['https://example.com/a'], usedWebSearch: true },
    })

    const user = userEvent.setup()

    renderHarness('bit-1')

    await user.click(screen.getByTestId('knowledge-bit-chat-open'))
    await user.type(screen.getByTestId('knowledge-bit-chat-input'), 'What is a closure?')
    await user.click(screen.getByTestId('knowledge-bit-chat-send'))
    await user.click(await screen.findByTestId('knowledge-bit-chat-card-web'))
    await user.click(await screen.findByTestId('knowledge-bit-chat-draft-chip'))
    await screen.findByTestId('knowledge-bit-chat-card-proposal')

    expect(mockedDraft).toHaveBeenCalledWith({
      data: expect.objectContaining({ allowWebSearch: true }),
    })
  })

  it('should turn the Draft a new card chip into an inline proposal that saves against the studied item', async () => {
    mockedAsk.mockResolvedValue({ reply: 'A closure keeps its scope.' })
    mockedDraft.mockResolvedValue({
      sources: [],
      card: {
        front: 'What is a closure?',
        back: 'A function plus its scope.',
        sources: [],
        usedWebSearch: false,
      },
    })
    mockedCreate.mockResolvedValue({
      id: 'kb-new',
      body: 'Q\nA',
      background: null,
      variants: [],
      feedback: null,
      origin: 'manual',
      isAiGenerated: false,
      sourceLinks: [],
    })

    const user = userEvent.setup()

    renderHarness('bit-1')

    await user.click(screen.getByTestId('knowledge-bit-chat-open'))

    expect(screen.queryByTestId('knowledge-bit-chat-draft-chip')).toBeFalsy()

    await user.type(screen.getByTestId('knowledge-bit-chat-input'), 'What is a closure?')
    await user.click(screen.getByTestId('knowledge-bit-chat-send'))
    await user.click(await screen.findByTestId('knowledge-bit-chat-draft-chip'))

    expect((await screen.findByTestId('knowledge-bit-chat-card-front')).textContent).toBe(
      'What is a closure?',
    )
    expect(mockedDraft).toHaveBeenCalledWith({
      data: expect.objectContaining({
        knowledgeBitId: 'bit-1',
        mode: 'create',
        instruction: 'make a card from this chat',
        allowWebSearch: false,
      }),
    })

    await user.click(screen.getByTestId('knowledge-bit-chat-card-approve'))
    await screen.findByTestId('knowledge-bit-chat-card-saved')

    expect(mockedCreate).toHaveBeenCalledWith({
      data: expect.objectContaining({
        knowledgeBitId: 'bit-1',
        front: 'What is a closure?',
        back: 'A function plus its scope.',
        aiGenerated: false,
        sourceLinks: [],
      }),
    })
  })
})
