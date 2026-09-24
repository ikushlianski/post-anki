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

import { getNextQuestionVariants, gradeQuestionVariant } from '../knowledge-bit/knowledge-answer.api'
import { Route } from './knowledge.answer'

const mockedGetNextQuestionVariants = vi.mocked(getNextQuestionVariants)
const mockedGradeQuestionVariant = vi.mocked(gradeQuestionVariant)

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
})
