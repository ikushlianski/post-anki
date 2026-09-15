// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import type { ReactNode } from 'react'

import type { Question } from './model'
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
