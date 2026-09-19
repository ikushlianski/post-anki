// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'

import { GlobalCardChatPanel } from './global-card-chat-panel'
import { askGlobalCardChat } from './global-card-chat.api'

vi.mock('./global-card-chat.api', () => ({
  askGlobalCardChat: vi.fn(),
}))

const mockedAsk = vi.mocked(askGlobalCardChat)

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
})

function renderHarness() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })

  return render(
    <QueryClientProvider client={queryClient}>
      <GlobalCardChatPanel />
    </QueryClientProvider>,
  )
}

describe('GlobalCardChatPanel', () => {
  it('answers a question with a reply grounded in the learner’s own cards', async () => {
    mockedAsk.mockResolvedValue({
      reply: 'A closure is a function bundled with its surrounding scope.',
      matchedCardIds: ['variant-1'],
    })

    const user = userEvent.setup()

    renderHarness()

    await user.click(screen.getByTestId('global-card-chat-open'))
    await user.type(screen.getByTestId('global-card-chat-input'), 'What is a closure?')
    await user.click(screen.getByTestId('global-card-chat-send'))

    expect(
      await screen.findByText('A closure is a function bundled with its surrounding scope.'),
    ).toBeTruthy()
    expect(mockedAsk).toHaveBeenCalledWith({
      data: { message: 'What is a closure?', transcript: [] },
    })
  })

  it('falls back to a plain retry message when the endpoint returns nothing', async () => {
    mockedAsk.mockResolvedValue(null)

    const user = userEvent.setup()

    renderHarness()

    await user.click(screen.getByTestId('global-card-chat-open'))
    await user.type(screen.getByTestId('global-card-chat-input'), 'What is hoisting?')
    await user.click(screen.getByTestId('global-card-chat-send'))

    expect(
      await screen.findByText("I couldn't reach the tutor right now — try again."),
    ).toBeTruthy()
  })
})
