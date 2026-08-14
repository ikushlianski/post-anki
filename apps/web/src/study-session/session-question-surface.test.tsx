// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'

import type { StudySessionPushResponse } from '@post-anki/shared'

vi.mock('../curriculum/probe-answer', () => ({
  ProbeAnswer: () => <div data-testid="mock-probe-answer" />,
}))

import { SessionQuestionSurface } from './session-question-surface'

afterEach(cleanup)

describe('SessionQuestionSurface', () => {
  it('shows a loading state while the push has not resolved yet', () => {
    render(<SessionQuestionSurface loading pushResult={null} onAnswered={vi.fn()} />)

    expect(screen.getByTestId('session-question-loading')).toBeTruthy()
  })

  it('shows a neutral empty state when nothing is left to study for the target', () => {
    render(
      <SessionQuestionSurface
        loading={false}
        pushResult={{ push: null, question: null }}
        onAnswered={vi.fn()}
      />,
    )

    expect(screen.getByTestId('session-question-empty')).toBeTruthy()
  })

  it('renders the gap and delegates to ProbeAnswer when a push is available', () => {
    const pushResult: StudySessionPushResponse = {
      push: {
        topicId: 't1',
        topicTitle: 'Hooks',
        curriculumId: 'c1',
        curriculumName: 'React',
        gap: {
          id: 'g1',
          topicId: 't1',
          label: 'useEffect cleanup',
          depth: 'working',
          origin: 'ai',
          state: 'open',
          wanted: false,
          concern: null,
          lastEvaluatedAt: null,
          triageState: 'untriaged',
          triagedAt: null,
          deferredUntil: null,
          deferralCount: 0,
          dismissedAt: null,
          dismissedCheckinSentAt: null,
        },
        reason: 'weakest',
      },
      question: {
        gapId: 'g1',
        gapLabel: 'useEffect cleanup',
        kind: 'socratic',
        prompt: 'Explain it',
      },
    }

    render(<SessionQuestionSurface loading={false} pushResult={pushResult} onAnswered={vi.fn()} />)

    expect(screen.getByText('React · Hooks')).toBeTruthy()
    expect(screen.getByText('useEffect cleanup')).toBeTruthy()
    expect(screen.getByTestId('mock-probe-answer')).toBeTruthy()
  })
})
