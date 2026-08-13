// @vitest-environment jsdom
import type { ReactNode } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'

import type { StudySessionListItem } from '@post-anki/shared'

vi.mock('@tanstack/react-router', () => ({
  Link: ({ children, ...rest }: { children: ReactNode }) => <a {...rest}>{children}</a>,
}))

import { ScheduleList } from './schedule-list'

afterEach(cleanup)

function item(overrides: Partial<StudySessionListItem>): StudySessionListItem {
  return {
    id: 's1',
    targetType: null,
    targetId: null,
    plannedDurationMinutes: 20,
    scheduledFor: null,
    status: 'planned',
    startedAt: null,
    completedAt: null,
    questionsAnswered: 0,
    questionsCorrect: 0,
    createdAt: '2026-08-08T00:00:00.000Z',
    missed: false,
    ...overrides,
  }
}

describe('ScheduleList', () => {
  it('never renders a missed-session counter or banner anywhere', () => {
    render(
      <ScheduleList
        sessions={[item({ id: 'missed', status: 'planned', missed: true })]}
        namesById={{}}
      />,
    )

    expect(screen.queryByText(/missed/i)).toBeNull()
    expect(screen.queryByTestId('schedule-list-item')).toBeNull()
  })

  it('lists an upcoming planned session with its target and duration', () => {
    render(
      <ScheduleList
        sessions={[item({ id: 'a', targetType: 'curriculum', targetId: 'c1', plannedDurationMinutes: 30 })]}
        namesById={{ c1: 'React' }}
      />,
    )

    expect(screen.getByText('Curriculum: React')).toBeTruthy()
    expect(screen.getByText('30 min')).toBeTruthy()
  })

  it('groups active and finished sessions into their own sections', () => {
    render(
      <ScheduleList
        sessions={[
          item({ id: 'a', status: 'in_progress' }),
          item({ id: 'b', status: 'completed' }),
        ]}
        namesById={{}}
      />,
    )

    const active = screen.getByTestId('schedule-list-active')
    const history = screen.getByTestId('schedule-list-history')

    expect(active.textContent).toMatch(/Resume/)
    expect(history.textContent).toMatch(/Review/)
  })
})
