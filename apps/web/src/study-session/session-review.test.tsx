// @vitest-environment jsdom
import type { ReactNode } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'

import type { StudySession } from '@post-anki/shared'

vi.mock('@tanstack/react-router', () => ({
  Link: ({ children, ...rest }: { children: ReactNode }) => <a {...rest}>{children}</a>,
}))

import { SessionReview } from './session-review'

afterEach(cleanup)

function session(overrides: Partial<StudySession> = {}): StudySession {
  return {
    id: 's1',
    targetType: null,
    targetId: null,
    plannedDurationMinutes: 20,
    scheduledFor: null,
    status: 'completed',
    startedAt: '2026-08-08T10:00:00.000Z',
    completedAt: '2026-08-08T10:17:00.000Z',
    questionsAnswered: 5,
    questionsCorrect: 4,
    createdAt: '2026-08-08T09:00:00.000Z',
    ...overrides,
  }
}

describe('SessionReview', () => {
  it('shows the frozen counters and elapsed minutes from the session record', () => {
    render(<SessionReview session={session()} />)

    expect(screen.getByTestId('review-answered').textContent).toBe('5')
    expect(screen.getByTestId('review-correct').textContent).toBe('4')
    expect(screen.getByTestId('review-minutes').textContent).toBe('17')
  })

  it('labels an abandoned session distinctly from a completed one, without implying failure', () => {
    render(<SessionReview session={session({ status: 'abandoned', questionsAnswered: 0, questionsCorrect: 0 })} />)

    expect(screen.getByText('Session ended')).toBeTruthy()
    expect(screen.queryByText(/fail/i)).toBeNull()
  })
})
