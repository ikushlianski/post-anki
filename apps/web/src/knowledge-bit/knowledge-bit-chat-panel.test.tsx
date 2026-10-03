// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'

import { KnowledgeBitChatPanel } from './knowledge-bit-chat-panel'
import { askKnowledgeBitChat } from './knowledge-bit-chat.api'

vi.mock('./knowledge-bit-chat.api', () => ({
  askKnowledgeBitChat: vi.fn(),
}))

const mockedAsk = vi.mocked(askKnowledgeBitChat)

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
})
