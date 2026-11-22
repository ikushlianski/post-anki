// @vitest-environment jsdom
import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest'
import { cleanup, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'

import { getSubjectReviewDueCounts } from '../curriculum/curriculum.api'
import { getReviewCards } from '../knowledge-bit/anki-review.api'
import { getSubjectDaySkips, setSubjectDaySkip } from './subject-day-skips.api'
import { TodaySubjects } from './today-subjects'

vi.mock('../curriculum/curriculum.api', () => ({ getSubjectReviewDueCounts: vi.fn() }))
vi.mock('../knowledge-bit/anki-review.api', () => ({ getReviewCards: vi.fn() }))
vi.mock('./subject-day-skips.api', () => ({ getSubjectDaySkips: vi.fn(), setSubjectDaySkip: vi.fn() }))
vi.mock('../shared/browser-time-zone', () => ({ browserTimeZone: () => 'UTC' }))
vi.mock('../review-offline/default-offline-store', () => ({ getOfflineStore: vi.fn() }))
vi.mock('../review-offline/send-queued-grade', () => ({ downloadReviewPack: vi.fn() }))
vi.mock('../review-offline/review-pack', () => ({ refreshStoredPack: vi.fn().mockResolvedValue(true) }))

const SUBJECTS = [
  { id: 'math', name: 'Math' },
  { id: 'art', name: 'Art' },
  { id: 'calc', name: 'Calculus', parentId: 'math' },
  { id: 'idle', name: 'Idle' },
]

const count = (subjectId: string, todayCount: number) => ({
  subjectId,
  dueCount: todayCount,
  newCount: 0,
  reviewTodayCount: todayCount,
  learningDueCount: 0,
  todayCount,
  limits: null,
})

let serverSkips: string[] = []

function renderToday() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })

  return render(
    <QueryClientProvider client={client}>
      <TodaySubjects subjects={SUBJECTS} />
    </QueryClientProvider>,
  )
}

describe('TodaySubjects', () => {
  beforeEach(() => {
    vi.mocked(getSubjectReviewDueCounts).mockResolvedValue({
      subjects: [count('math', 5), count('art', 3), count('calc', 2), count('idle', 0)],
      unsorted: { dueCount: 0, newCount: 0, reviewTodayCount: 0, learningDueCount: 0, todayCount: 0 },
      newRemainingToday: 0,
      reviewsRemainingToday: null,
    })
    serverSkips = []
    vi.mocked(getSubjectDaySkips).mockImplementation(async () => ({ dayKey: '2026-11-22', subjectIds: serverSkips }))
    vi.mocked(setSubjectDaySkip).mockImplementation(async (options) => {
      const input = options?.data as { subjectId: string; skipped: boolean }

      serverSkips = input.skipped ? [input.subjectId] : []

      return { dayKey: '2026-11-22', subjectIds: serverSkips }
    })
  })
  afterEach(() => {
    cleanup()
    vi.clearAllMocks()
  })

  it('should list only top-level subjects that have cards due today with a total', async () => {
    renderToday()

    expect(await screen.findByTestId('today-subject-math')).toBeTruthy()
    expect(screen.getByTestId('today-subject-art')).toBeTruthy()
    expect(screen.queryByTestId('today-subject-calc')).toBeNull()
    expect(screen.queryByTestId('today-subject-idle')).toBeNull()
    expect(screen.getByTestId('today-subjects-total').textContent).toBe('8')
  })

  it('should grey the subject, strike its count and drop it from the total when unchecked', async () => {
    renderToday()

    await userEvent.click(await screen.findByRole('checkbox', { name: 'Study Math today' }))

    await waitFor(() => expect(screen.getByTestId('today-subjects-total').textContent).toBe('3'))
    expect(screen.getByTestId('today-subject-count-math').className).toContain('line-through')
    expect(screen.getByTestId('today-subject-math').className).toContain('opacity-50')
    expect(vi.mocked(setSubjectDaySkip).mock.calls[0]?.[0]).toEqual({ data: { subjectId: 'math', skipped: true, tz: 'UTC' } })
  })

  it('should bring the subject back into the total when checked again', async () => {
    serverSkips = ['math']
    renderToday()

    const box = await screen.findByRole('checkbox', { name: 'Study Math today' })

    await waitFor(() => expect((box as HTMLInputElement).checked).toBe(false))
    expect(screen.getByTestId('today-subjects-total').textContent).toBe('3')

    await userEvent.click(box)

    await waitFor(() => expect(screen.getByTestId('today-subjects-total').textContent).toBe('8'))
  })

  it('should load a subject cards only when its card is expanded', async () => {
    vi.mocked(getReviewCards).mockResolvedValue({
      ok: true,
      cards: [],
      counts: { new: 0, learning: 0, review: 0 },
      newRemainingToday: 0,
      nextDueAt: null,
    })
    renderToday()

    await screen.findByTestId('today-subject-math')

    expect(getReviewCards).not.toHaveBeenCalled()

    await userEvent.click(screen.getByRole('button', { name: 'Show cards for Math' }))

    expect(await screen.findByText('No cards due.')).toBeTruthy()
    expect(vi.mocked(getReviewCards).mock.calls[0]?.[0]).toEqual({
      data: { limit: 50, tz: 'UTC', aheadDays: 0, subjectId: 'math' },
    })
  })
})
