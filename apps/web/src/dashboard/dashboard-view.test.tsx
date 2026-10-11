// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { cleanup, render, screen } from '@testing-library/react'
import type { ReactNode } from 'react'
import type { SubjectReviewDueCounts } from '@post-anki/shared'

import {
  dashboardCurricula,
  dashboardDueTopics,
  dashboardStreak,
  dashboardSubjects,
} from '../mocks/dashboard.mock'
import type { DashboardViewProps } from './dashboard-view'
import { DashboardView } from './dashboard-view'

vi.mock('@tanstack/react-router', () => ({
  Link: ({
    to,
    params,
    search,
    children,
    ...rest
  }: {
    to: string
    params?: Record<string, string>
    search?: Record<string, string>
    children: ReactNode
    'data-testid'?: string
  }) => (
    <a
      href={`${to}?${JSON.stringify(params ?? {})}${search ? `&${new URLSearchParams(search).toString()}` : ''}`}
      {...rest}
    >
      {children}
    </a>
  ),
  useRouter: () => ({ invalidate: vi.fn(async () => undefined) }),
}))

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
})

const COUNTS: SubjectReviewDueCounts = {
  subjects: [
    { subjectId: 'subject-business', dueCount: 3, newCount: 1 },
    { subjectId: 'subject-english', dueCount: 0, newCount: 0 },
  ],
  unsorted: { dueCount: 2, newCount: 0 },
  newRemainingToday: 5,
}

function renderView(subjectDueCounts?: DashboardViewProps['subjectDueCounts']) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })

  render(
    <QueryClientProvider client={queryClient}>
      <DashboardView
        subjects={dashboardSubjects}
        curricula={dashboardCurricula}
        courseRefocusSuggestions={{ ok: true, data: [] }}
        sessions={{ ok: true, data: [] }}
        learningPaths={{ ok: true, data: [] }}
        streak={{ ok: true, data: dashboardStreak }}
        dueTopics={{ ok: true, data: dashboardDueTopics }}
        subjectDueCounts={subjectDueCounts}
        onRenameSubject={vi.fn(async () => true)}
        onDeleteSubject={vi.fn(async () => true)}
        onCreateSubSubject={vi.fn(async () => true)}
        onMoveSubject={vi.fn(async () => true)}
      />
    </QueryClientProvider>,
  )
}

describe('DashboardView due counts', () => {
  it('should show each subject its due count and the unsorted bucket when the counts load', () => {
    renderView({ ok: true, data: COUNTS })

    expect(screen.getByTestId('subject-due-count-subject-business').textContent).toBe('3 due')
    expect(screen.getByTestId('subject-due-count-subject-english').textContent).toBe('0 due')
    expect(screen.getByTestId('unsorted-due-count').textContent).toBe('2 due')
  })

  it('should offer a review link only for a subject with cards due', () => {
    renderView({ ok: true, data: COUNTS })

    expect(screen.getByTestId('subject-review-subject-business')).toBeDefined()
    expect(screen.queryByTestId('subject-review-subject-english')).toBeNull()
  })

  it('should show a load error and still list the subjects when the counts fail to load', () => {
    renderView({ ok: false })

    expect(screen.getByText("Couldn't load your review counts — try refreshing.")).toBeDefined()
    expect(screen.queryByTestId('unsorted-due-bucket')).toBeNull()
    expect(screen.queryByTestId('subject-due-count-subject-business')).toBeNull()
    expect(screen.getAllByTestId('subject-name')).toHaveLength(dashboardSubjects.length)
  })

  it('should show no due counts before the counts are loaded', () => {
    renderView(undefined)

    expect(screen.queryByTestId('subject-due-count-subject-business')).toBeNull()
    expect(screen.queryByTestId('unsorted-due-bucket')).toBeNull()
    expect(screen.queryByText("Couldn't load your review counts — try refreshing.")).toBeNull()
  })
})
