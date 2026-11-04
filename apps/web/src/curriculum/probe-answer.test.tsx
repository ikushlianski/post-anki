// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import type { ReactNode } from 'react'

import type { Question } from './model'
import { nextQuestion, submitAttempt } from './curriculum.api'
import { ProbeAnswer } from './probe-answer'

vi.mock('@tanstack/react-router', () => ({
  useRouter: () => ({ invalidate: vi.fn() }),
  Link: ({ children }: { children: ReactNode }) => <a href="#">{children}</a>,
}))

vi.mock('./curriculum.api', () => ({
  nextQuestion: vi.fn(),
  submitAttempt: vi.fn(),
}))

function baseQuestion(overrides: Partial<Question> = {}): Question {
  return {
    id: 'q1',
    topicId: 'top_1',
    gapId: null,
    gapLabel: null,
    kind: 'quick_test',
    prompt: 'What does this do?',
    options: ['a', 'b'],
    correctAnswerIndex: 0,
    sources: [],
    ...overrides,
  }
}

describe('ProbeAnswer.groundedInSources', () => {
  afterEach(cleanup)

  it('never turns an unsafe grounding source url into a clickable href', () => {
    render(
      <ProbeAnswer
        topicId="top_1"
        mode="quick_test"
        question={baseQuestion({ sources: ['javascript:alert(1)'] })}
      />,
    )

    const link = screen.getByTitle('javascript:alert(1)')

    expect(link?.hasAttribute('href')).toBe(false)
  })

  it('keeps a genuinely safe grounding source url clickable', () => {
    render(
      <ProbeAnswer
        topicId="top_1"
        mode="quick_test"
        question={baseQuestion({ sources: ['https://example.com/docs'] })}
      />,
    )

    const link = screen.getByText('example.com').closest('a')

    expect(link?.getAttribute('href')).toBe('https://example.com/docs')
  })
})

describe('ProbeAnswer.probeNextGap', () => {
  afterEach(() => {
    cleanup()
    vi.clearAllMocks()
  })

  async function answerAndAskForNext() {
    vi.mocked(submitAttempt).mockResolvedValue(null as never)

    render(
      <ProbeAnswer
        topicId="top_1"
        mode="quick_test"
        question={baseQuestion({ gapId: 'g1', gapLabel: 'gap one' })}
      />,
    )

    fireEvent.click(screen.getByText('a'))
    fireEvent.click(await screen.findByText('Probe the next gap'))
  }

  it('tells the learner every gap is covered only when the server has no more gaps', async () => {
    vi.mocked(nextQuestion).mockResolvedValue(null as never)

    await answerAndAskForNext()

    expect(await screen.findByText(/every in-scope gap is/)).toBeTruthy()
    expect(screen.queryByTestId('probe-next-error')).toBeNull()
  })

  it('shows a load failure with a retry instead of claiming all gaps are covered', async () => {
    vi.mocked(nextQuestion).mockRejectedValue(new Error('network'))

    await answerAndAskForNext()

    expect(await screen.findByTestId('probe-next-error')).toBeTruthy()
    expect(screen.queryByText(/every in-scope gap is/)).toBeNull()
  })

  it('moves to the next gap when retry succeeds after a failed load', async () => {
    vi.mocked(nextQuestion)
      .mockRejectedValueOnce(new Error('network'))
      .mockResolvedValueOnce(
        baseQuestion({ id: 'q2', prompt: 'Second question', gapId: 'g2', gapLabel: 'gap two' }),
      )

    await answerAndAskForNext()
    fireEvent.click(await screen.findByText('Retry'))

    await waitFor(() => expect(screen.getByText('Second question')).toBeTruthy())
    expect(screen.queryByTestId('probe-next-error')).toBeNull()
  })
})
