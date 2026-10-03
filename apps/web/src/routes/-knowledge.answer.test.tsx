// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { cleanup, render, screen, fireEvent, waitFor } from '@testing-library/react'
import type { ReactNode } from 'react'

vi.mock('@tanstack/react-router', () => ({
  createFileRoute: () => (config: { component: () => ReactNode }) => ({
    useSearch: () => ({ tagId: undefined }),
    component: config.component,
  }),
}))

vi.mock('../knowledge-bit/knowledge-answer.api')
vi.mock('../knowledge-bit/knowledge-bit-chat.api')

import { getNextQuestionVariants, gradeQuestionVariant } from '../knowledge-bit/knowledge-answer.api'
import { askKnowledgeBitChat } from '../knowledge-bit/knowledge-bit-chat.api'
import { Route } from './knowledge.answer'

const mockedGetNextQuestionVariants = vi.mocked(getNextQuestionVariants)
const mockedGradeQuestionVariant = vi.mocked(gradeQuestionVariant)
const mockedAskKnowledgeBitChat = vi.mocked(askKnowledgeBitChat)

const AnswerScreen = (Route as unknown as { component: () => ReactNode }).component

function renderWithClient(ui: ReactNode) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })

  return render(<QueryClientProvider client={queryClient}>{ui}</QueryClientProvider>)
}

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
})

describe('AnswerScreen', () => {
  it('shows the real feedback returned by the grading API after submitting', async () => {
    mockedGetNextQuestionVariants.mockResolvedValue([
      {
        variantId: 'variant-1',
        kind: 'wh_question',
        prompt: 'Why does X happen?',
        knowledgeBitId: 'bit-1',
        bitBody: 'X happens because of Y.',
      },
    ])
    mockedGradeQuestionVariant.mockResolvedValue({
      ok: true,
      score: 1,
      verdict: 'Ok',
      feedback: 'Correctly explains the mechanism.',
      followUpQuestion: null,
      tagIds: [],
    })

    renderWithClient(<AnswerScreen />)

    const textarea = await screen.findByTestId('answer-screen-textarea')
    fireEvent.change(textarea, { target: { value: 'Because of Y.' } })
    fireEvent.click(screen.getByTestId('answer-screen-submit'))

    const feedback = await screen.findByTestId('answer-screen-feedback')
    expect(feedback.textContent).toContain('Correctly explains the mechanism.')
  })

  it('advances to the next question in the batch after submitting', async () => {
    mockedGetNextQuestionVariants.mockResolvedValue([
      {
        variantId: 'variant-1',
        kind: 'wh_question',
        prompt: 'Why does X happen?',
        knowledgeBitId: 'bit-1',
        bitBody: 'X happens because of Y.',
      },
      {
        variantId: 'variant-2',
        kind: 'fill_in_the_blank',
        prompt: 'Z is caused by ___.',
        knowledgeBitId: 'bit-2',
        bitBody: 'Z is caused by W.',
      },
    ])
    mockedGradeQuestionVariant.mockResolvedValue({
      ok: true,
      score: 1,
      verdict: 'Ok',
      feedback: 'Nice.',
      followUpQuestion: null,
      tagIds: [],
    })

    renderWithClient(<AnswerScreen />)

    const textarea = await screen.findByTestId('answer-screen-textarea')
    fireEvent.change(textarea, { target: { value: 'Because of Y.' } })
    fireEvent.click(screen.getByTestId('answer-screen-submit'))

    await screen.findByTestId('answer-screen-feedback')
    fireEvent.click(screen.getByTestId('answer-screen-next'))

    await waitFor(() => {
      expect(screen.getByTestId('answer-screen-question').textContent).toContain(
        'Z is caused by ___.',
      )
    })
  })

  it('resets the chat panel to the new bit instead of carrying over the previous conversation', async () => {
    mockedGetNextQuestionVariants.mockResolvedValue([
      {
        variantId: 'variant-1',
        kind: 'wh_question',
        prompt: 'Why does X happen?',
        knowledgeBitId: 'bit-1',
        bitBody: 'X happens because of Y.',
      },
      {
        variantId: 'variant-2',
        kind: 'fill_in_the_blank',
        prompt: 'Z is caused by ___.',
        knowledgeBitId: 'bit-2',
        bitBody: 'Z is caused by W.',
      },
    ])
    mockedGradeQuestionVariant.mockResolvedValue({
      ok: true,
      score: 1,
      verdict: 'Ok',
      feedback: 'Nice.',
      followUpQuestion: null,
      tagIds: [],
    })
    mockedAskKnowledgeBitChat.mockResolvedValue({ reply: 'About bit-1.' })

    renderWithClient(<AnswerScreen />)

    fireEvent.click(await screen.findByTestId('knowledge-bit-chat-open'))
    fireEvent.change(screen.getByTestId('knowledge-bit-chat-input'), {
      target: { value: 'What does this mean?' },
    })
    fireEvent.click(screen.getByTestId('knowledge-bit-chat-send'))
    await screen.findByText('About bit-1.')

    expect(mockedAskKnowledgeBitChat).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ knowledgeBitId: 'bit-1' }) }),
    )

    const textarea = screen.getByTestId('answer-screen-textarea')
    fireEvent.change(textarea, { target: { value: 'Because of Y.' } })
    fireEvent.click(screen.getByTestId('answer-screen-submit'))

    await screen.findByTestId('answer-screen-feedback')
    fireEvent.click(screen.getByTestId('answer-screen-next'))

    await waitFor(() => {
      expect(screen.getByTestId('answer-screen-question').textContent).toContain(
        'Z is caused by ___.',
      )
    })

    expect(screen.queryByTestId('knowledge-bit-chat-panel')).toBeFalsy()
    expect(screen.getByTestId('knowledge-bit-chat-open')).toBeTruthy()
  })
})
