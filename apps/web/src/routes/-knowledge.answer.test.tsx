// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { cleanup, render, screen, fireEvent, waitFor } from '@testing-library/react'
import type { ReactNode } from 'react'

const searchState = vi.hoisted(() => ({ current: { tagId: undefined } as { tagId?: string } }))

vi.mock('@tanstack/react-router', () => ({
  createFileRoute: () => (config: { component: () => ReactNode }) => ({
    useSearch: () => searchState.current,
    component: config.component,
  }),
  Link: ({
    children,
    to,
    search,
    ...rest
  }: { children: ReactNode; to?: string; search?: Record<string, unknown> } & Record<
    string,
    unknown
  >) => (
    <a href="#" data-to={to} data-search={search ? JSON.stringify(search) : undefined} {...rest}>
      {children}
    </a>
  ),
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
  searchState.current = { tagId: undefined }
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

  it('keeps the learner on the same tag when switching to Anki review', async () => {
    searchState.current = { tagId: 'tag-7' }
    mockedGetNextQuestionVariants.mockResolvedValue([])

    renderWithClient(<AnswerScreen />)

    const link = await screen.findByTestId('answer-screen-switch-to-anki')

    expect(link.getAttribute('data-to')).toBe('/knowledge/review')
    expect(JSON.parse(link.getAttribute('data-search') ?? '{}')).toEqual({ tagId: 'tag-7' })
  })

  it('tells the learner loading failed and refetches on Retry instead of claiming nothing is due', async () => {
    mockedGetNextQuestionVariants.mockRejectedValueOnce(new Error('network'))
    mockedGetNextQuestionVariants.mockResolvedValue([
      {
        variantId: 'variant-1',
        kind: 'wh_question',
        prompt: 'Why does X happen?',
        knowledgeBitId: 'bit-1',
        bitBody: 'X happens because of Y.',
      },
    ])

    renderWithClient(<AnswerScreen />)

    const loadError = await screen.findByTestId('answer-screen-load-error')

    expect(loadError.textContent).toContain("Couldn't load your questions")
    expect(screen.queryByTestId('answer-screen-empty')).toBeNull()

    fireEvent.click(screen.getByTestId('answer-screen-retry'))

    await screen.findByTestId('answer-screen-question')
    expect(screen.queryByTestId('answer-screen-load-error')).toBeNull()
  })

  describe('typed answer shortcuts', () => {
    beforeEach(() => {
      mockedGradeQuestionVariant.mockReset()
    })

    const variant = {
      variantId: 'variant-1',
      kind: 'wh_question' as const,
      prompt: 'Why does X happen?',
      knowledgeBitId: 'bit-1',
      bitBody: 'X happens because of Y.',
    }

    it('should let the learner skip a question without grading it', async () => {
      mockedGetNextQuestionVariants.mockResolvedValue([
        variant,
        { ...variant, variantId: 'variant-2', prompt: 'Second question?' },
      ])
      renderWithClient(<AnswerScreen />)

      await screen.findByText('Why does X happen?')
      fireEvent.click(screen.getByTestId('answer-screen-skip'))

      await screen.findByText('Second question?')
      expect(mockedGradeQuestionVariant).not.toHaveBeenCalled()
    })

    it('should submit once on Ctrl+Enter even when pressed twice while grading', async () => {
      mockedGetNextQuestionVariants.mockResolvedValue([variant])
      mockedGradeQuestionVariant.mockReturnValue(new Promise(() => {}))
      renderWithClient(<AnswerScreen />)

      const textarea = await screen.findByTestId('answer-screen-textarea')

      fireEvent.change(textarea, { target: { value: 'Because of Y.' } })
      fireEvent.keyDown(textarea, { key: 'Enter', ctrlKey: true })
      fireEvent.keyDown(textarea, { key: 'Enter', ctrlKey: true })

      await waitFor(() => expect(mockedGradeQuestionVariant).toHaveBeenCalledTimes(1))
    })

    it('should submit on Cmd+Enter but not on plain Enter', async () => {
      mockedGetNextQuestionVariants.mockResolvedValue([variant])
      mockedGradeQuestionVariant.mockReturnValue(new Promise(() => {}))
      renderWithClient(<AnswerScreen />)

      const textarea = await screen.findByTestId('answer-screen-textarea')

      fireEvent.change(textarea, { target: { value: 'Because of Y.' } })
      fireEvent.keyDown(textarea, { key: 'Enter' })
      expect(mockedGradeQuestionVariant).not.toHaveBeenCalled()

      fireEvent.keyDown(textarea, { key: 'Enter', metaKey: true })
      await waitFor(() => expect(mockedGradeQuestionVariant).toHaveBeenCalledTimes(1))
    })
  })

  describe('when grading fails', () => {
    async function failGrading() {
      mockedGetNextQuestionVariants.mockResolvedValue([
        {
          variantId: 'variant-1',
          kind: 'wh_question',
          prompt: 'Why does X happen?',
          knowledgeBitId: 'bit-1',
          bitBody: 'X happens because of Y.',
        },
      ])
      mockedGradeQuestionVariant.mockResolvedValue({ ok: false, error: 'grading_failed' })

      renderWithClient(<AnswerScreen />)

      const textarea = await screen.findByTestId('answer-screen-textarea')
      fireEvent.change(textarea, { target: { value: 'A long written answer.' } })
      fireEvent.click(screen.getByTestId('answer-screen-submit'))

      return screen.findByTestId('answer-screen-error')
    }

    it('shows a plain sentence without the raw error code', async () => {
      const error = await failGrading()

      expect(error.textContent).toContain("We couldn't grade your answer")
      expect(error.textContent).not.toContain('grading_failed')
    })

    it('keeps the typed answer when the learner chooses Try again', async () => {
      await failGrading()
      fireEvent.click(screen.getByTestId('answer-screen-try-again'))

      const textarea = await screen.findByTestId('answer-screen-textarea')

      expect((textarea as HTMLTextAreaElement).value).toBe('A long written answer.')
    })

    it('clears the typed answer when the learner skips the question', async () => {
      await failGrading()
      mockedGetNextQuestionVariants.mockResolvedValue([
        {
          variantId: 'variant-2',
          kind: 'wh_question',
          prompt: 'Another question?',
          knowledgeBitId: 'bit-2',
          bitBody: 'Body.',
        },
      ])
      fireEvent.click(screen.getByTestId('answer-screen-next'))

      const textarea = await screen.findByTestId('answer-screen-textarea')

      expect((textarea as HTMLTextAreaElement).value).toBe('')
    })
  })
})
