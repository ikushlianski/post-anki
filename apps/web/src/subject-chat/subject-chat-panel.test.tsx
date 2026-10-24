// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'

import { SubjectChatPanel } from './subject-chat-panel'
import { askSubjectChat } from './subject-chat.api'

vi.mock('./subject-chat.api', () => ({ askSubjectChat: vi.fn() }))

const mockedAsk = vi.mocked(askSubjectChat)

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
})

function renderPanel(props: Partial<React.ComponentProps<typeof SubjectChatPanel>> = {}) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })

  return render(
    <QueryClientProvider client={client}>
      <SubjectChatPanel
        subjectId="subject-1"
        selection=""
        onClearSelection={() => {}}
        card={{ cardId: 'variant-1', text: 'What is a closure?\nA function with its scope.' }}
        {...props}
      />
    </QueryClientProvider>,
  )
}

async function ask(question: string) {
  const user = userEvent.setup()

  await user.type(screen.getByTestId('subject-chat-input'), question)
  await user.click(screen.getByTestId('subject-chat-send'))

  return user
}

describe('SubjectChatPanel', () => {
  it('should list the knowledge pieces an answer was built from', async () => {
    mockedAsk.mockResolvedValue({
      reply: 'A closure keeps its scope.',
      usedBits: [
        { id: 'b1', preview: 'Closures capture variables' },
        { id: 'b2', preview: 'Scope is lexical' },
      ],
      lookupFailed: false,
      noMatch: false,
    })
    renderPanel()

    await ask('What is a closure?')

    expect(await screen.findByText('A closure keeps its scope.')).toBeTruthy()
    expect(screen.getByTestId('subject-chat-used-bits').textContent).toContain('Closures capture variables')
    expect(screen.getByTestId('subject-chat-used-bits').textContent).toContain('Scope is lexical')
    expect(mockedAsk).toHaveBeenCalledWith({
      data: { subjectId: 'subject-1', message: 'What is a closure?', transcript: [], context: undefined },
    })
  })

  it('should say the subject does not cover a question when nothing matched', async () => {
    mockedAsk.mockResolvedValue({ reply: 'Not covered.', usedBits: [], lookupFailed: false, noMatch: true })
    renderPanel()

    await ask('Unrelated?')

    expect(await screen.findByTestId('subject-chat-no-match')).toBeTruthy()
    expect(screen.queryByTestId('subject-chat-used-bits')).toBeNull()
  })

  it('should tell the learner when the knowledge search failed', async () => {
    mockedAsk.mockResolvedValue({ reply: 'Try later.', usedBits: [], lookupFailed: true, noMatch: false })
    renderPanel()

    await ask('Anything?')

    expect(await screen.findByTestId('subject-chat-lookup-failed')).toBeTruthy()
  })

  it('should send the highlighted text as context and let the learner remove it', async () => {
    mockedAsk.mockResolvedValue({ reply: 'ok', usedBits: [], lookupFailed: false, noMatch: false })
    const onClear = vi.fn()

    renderPanel({ selection: 'lexical scope', onClearSelection: onClear })

    expect(screen.getByTestId('subject-chat-selection-chip').textContent).toContain('lexical scope')

    const user = await ask('Explain this')

    await screen.findByText('ok')
    expect(mockedAsk).toHaveBeenNthCalledWith(1, {
      data: expect.objectContaining({
        context: { kind: 'selection', text: 'lexical scope', cardId: 'variant-1' },
      }),
    })

    await user.click(screen.getByTestId('subject-chat-selection-clear'))
    expect(onClear).toHaveBeenCalled()
  })

  it('should only send the current card as context after the learner opts in', async () => {
    mockedAsk.mockResolvedValue({ reply: 'ok', usedBits: [], lookupFailed: false, noMatch: false })
    renderPanel()

    const user = await ask('First')

    await screen.findByText('ok')
    expect(mockedAsk).toHaveBeenNthCalledWith(1, {
      data: expect.objectContaining({ context: undefined }),
    })

    await user.click(screen.getByTestId('subject-chat-use-card'))
    await user.type(screen.getByTestId('subject-chat-input'), 'Second')
    await user.click(screen.getByTestId('subject-chat-send'))

    await vi.waitFor(() => expect(mockedAsk).toHaveBeenCalledTimes(2))
    expect(mockedAsk).toHaveBeenNthCalledWith(2, {
      data: expect.objectContaining({
        context: {
          kind: 'card',
          text: 'What is a closure?\nA function with its scope.',
          cardId: 'variant-1',
        },
      }),
    })
  })

  it('should keep Send disabled while an answer is pending', async () => {
    mockedAsk.mockReturnValue(new Promise(() => {}))
    renderPanel()

    const user = await ask('Waiting')

    expect((screen.getByTestId('subject-chat-send') as HTMLButtonElement).disabled).toBe(true)
    expect((screen.getByTestId('subject-chat-input') as HTMLInputElement).disabled).toBe(true)

    await user.click(screen.getByTestId('subject-chat-send'))
    expect(mockedAsk).toHaveBeenCalledTimes(1)
  })

  it('should show a disabled explanation when the card has no subject', () => {
    renderPanel({ subjectId: null })

    expect(screen.getByTestId('subject-chat-disabled').textContent).toContain('isn\'t linked to a subject')
    expect(screen.queryByTestId('subject-chat-input')).toBeNull()
  })
})
