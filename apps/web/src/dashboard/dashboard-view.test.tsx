// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { cleanup, render, screen, within } from '@testing-library/react'
import type { ReactNode } from 'react'
import type { StudyOverview, SubjectReviewDueCounts } from '@post-anki/shared'

import {
  dashboardCurricula,
  dashboardSubjects,
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

vi.mock('../gamification/level-chip', () => ({
  LevelChip: () => <div data-testid="level-chip" />,
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

const OVERVIEW: StudyOverview = {
  counts: { new: 2, learning: 1, review: 3 },
  reviewedToday: 4,
  activity: [{ date: '2026-10-26', count: 4 }],
  nextDueAt: null,
  hasCards: true,
}

function renderView(
  subjectDueCounts?: DashboardViewProps['subjectDueCounts'],
  studyOverview: DashboardViewProps['studyOverview'] = { ok: true, data: OVERVIEW },
  subjects: DashboardViewProps['subjects'] = dashboardSubjects,
) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })

  render(
    <QueryClientProvider client={queryClient}>
      <DashboardView
        curricula={dashboardCurricula}
        courseRefocusSuggestions={{ ok: true, data: [] }}
        sessions={{ ok: true, data: [] }}
        learningPaths={{ ok: true, data: [] }}
        streak={{ ok: true, data: dashboardStreak }}
        subjects={subjects}
        studyOverview={studyOverview}
        subjectDueCounts={subjectDueCounts}
      />
    </QueryClientProvider>,
  )
}

describe('DashboardView due counts', () => {
  it('should show the unsorted bucket when the counts load', () => {
    renderView({ ok: true, data: COUNTS })

    expect(within(screen.getByTestId('unsorted-due-bucket')).getByTestId('busiest-subject-due').textContent).toBe('2')
  })

  it('should not list subjects on the overview', () => {
    renderView({ ok: true, data: COUNTS })

    expect(screen.queryAllByTestId('subject-name')).toHaveLength(0)
    expect(screen.queryByText('Your subjects')).toBeNull()
    expect(screen.queryByRole('searchbox')).toBeNull()
    expect(screen.queryByTestId('home-options')).toBeNull()
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

  it('should keep the other cards when the study overview fails to load', () => {
    renderView({ ok: true, data: COUNTS }, { ok: false })

    expect(screen.getAllByText("Couldn't load your review counts — try refreshing.").length).toBeGreaterThan(0)
    expect(screen.getByTestId('busiest-subjects')).toBeDefined()
    expect(screen.getByTestId('progress-strip')).toBeDefined()
  })

  it('should name the page once and put Study now before the busiest subjects', () => {
    renderView({ ok: true, data: COUNTS })

    expect(screen.getAllByRole('heading', { level: 1 })).toHaveLength(1)
    expect(screen.getByRole('heading', { level: 1, name: 'Post Anki' })).toBeDefined()
    expect(
      screen.getByTestId('study-now-card').compareDocumentPosition(screen.getByTestId('busiest-subjects')) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy()
  })

  it('should not run the review session inside the home page', () => {
    renderView({ ok: true, data: COUNTS })

    expect(screen.queryByTestId('home-review')).toBeNull()
  })
})

describe('DashboardView for a new account', () => {
  it('should show only a Start here card when there are no cards and no subjects', () => {
    renderView(undefined, { ok: true, data: { ...OVERVIEW, hasCards: false } }, [])

    expect(screen.getByTestId('start-here-card')).toBeDefined()
    expect(screen.getByTestId('start-here-add').textContent).toBe('Add knowledge')
    expect(screen.getByTestId('start-here-review').textContent).toBe('Review')
    expect(screen.queryByTestId('busiest-subjects')).toBeNull()
    expect(screen.queryByTestId('progress-strip')).toBeNull()
    expect(screen.queryByText('No activity in the last two weeks yet.')).toBeNull()
  })

  it('should keep the normal home once any subject exists', () => {
    renderView(undefined, { ok: true, data: { ...OVERVIEW, hasCards: false } })

    expect(screen.queryByTestId('start-here-card')).toBeNull()
    expect(screen.getByTestId('progress-strip')).toBeDefined()
  })
})
