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
        curricula={dashboardCurricula}
        courseRefocusSuggestions={{ ok: true, data: [] }}
        sessions={{ ok: true, data: [] }}
        learningPaths={{ ok: true, data: [] }}
        streak={{ ok: true, data: dashboardStreak }}
        dueTopics={{ ok: true, data: dashboardDueTopics }}
        subjectDueCounts={subjectDueCounts}
      />
    </QueryClientProvider>,
  )
}

describe('DashboardView due counts', () => {
  it('should show the unsorted bucket when the counts load', () => {
    renderView({ ok: true, data: COUNTS })

    expect(screen.getByTestId('unsorted-due-count').textContent).toBe('2 due')
  })

  it('should not list subjects on the overview', () => {
    renderView({ ok: true, data: COUNTS })

    expect(screen.queryAllByTestId('subject-name')).toHaveLength(0)
    expect(screen.queryByText('Your subjects')).toBeNull()
  })

  it('should show a load error when the counts fail to load', () => {
    renderView({ ok: false })

    expect(screen.getByText("Couldn't load your review counts — try refreshing.")).toBeDefined()
    expect(screen.queryByTestId('unsorted-due-bucket')).toBeNull()
  })

  it('should show no due counts before the counts are loaded', () => {
    renderView(undefined)

    expect(screen.queryByTestId('unsorted-due-bucket')).toBeNull()
    expect(screen.queryByText("Couldn't load your review counts — try refreshing.")).toBeNull()
  })
})
