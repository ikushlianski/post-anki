// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen, waitFor } from '@testing-library/react'

vi.mock('@tanstack/react-router', () => ({
  Link: ({ children, to }: { children: React.ReactNode; to: string }) => (
    <a href={to}>{children}</a>
  ),
}))

vi.mock('../curriculum/stats.api', () => ({ getStreak: vi.fn() }))

vi.mock('./daily-review-storage', () => ({
  getDailyReviewCount: vi.fn(() => 0),
}))

vi.mock('../study-plan/study-forecast-compact', () => ({
  SubjectForecastLoader: ({ subjectId }: { subjectId: string }) => <div data-testid="forecast-loader">{subjectId}</div>,
}))

import { getStreak } from '../curriculum/stats.api'
import { getDailyReviewCount } from './daily-review-storage'
import { AnkiReviewDone } from './anki-review-done'

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(new Date(2026, 9, 28, 12))
})

afterEach(() => {
  cleanup()
  vi.useRealTimers()
  vi.clearAllMocks()
  vi.mocked(getStreak).mockResolvedValue(null)
})

describe('AnkiReviewDone streak', () => {
  it('should show the current streak after finishing', async () => {
    vi.mocked(getStreak).mockResolvedValue({ currentStreak: 4, longestStreak: 9 } as never)
    render(<AnkiReviewDone nextDueAt={null} noApprovedCards={false} />)

    await waitFor(() => expect(screen.getByTestId('anki-review-streak').textContent).toBe('Streak: 4 days'))
  })

  it('should show no streak line when the call fails', async () => {
    vi.mocked(getStreak).mockRejectedValue(new Error('x'))
    render(<AnkiReviewDone nextDueAt={null} noApprovedCards={false} />)

    await waitFor(() => expect(getStreak).toHaveBeenCalled())
    expect(screen.queryByTestId('anki-review-streak')).toBeNull()
  })
})

describe('AnkiReviewDone study ahead', () => {
  it('should offer to study ahead and call back when chosen', () => {
    const onStudyAhead = vi.fn()

    render(<AnkiReviewDone nextDueAt="2026-11-05T09:00:00Z" noApprovedCards={false} onStudyAhead={onStudyAhead} />)
    screen.getByRole('button', { name: 'Study ahead anyway' }).click()

    expect(onStudyAhead).toHaveBeenCalledTimes(1)
  })

  it('should not offer study ahead when no handler is given', () => {
    render(<AnkiReviewDone nextDueAt={null} noApprovedCards={false} />)

    expect(screen.queryByRole('button', { name: 'Study ahead anyway' })).toBeNull()
  })
})

describe('AnkiReviewDone', () => {
  it('should announce the done screen to screen readers', () => {
    render(<AnkiReviewDone nextDueAt={null} noApprovedCards={false} />)

    expect(screen.getByTestId('anki-review-done').getAttribute('role')).toBe('status')
  })


  it('should show empty state when no approved cards exist', () => {
    render(<AnkiReviewDone nextDueAt={null} noApprovedCards={true} />)

    expect(screen.getByTestId('anki-review-empty').textContent).toBe('No cards to review yet')
  })

  it('should show done state with next-due when cards exist', () => {
    const future = new Date(Date.now() + 25 * 3600 * 1000).toISOString()
    render(<AnkiReviewDone nextDueAt={future} noApprovedCards={false} />)

    expect(screen.getByTestId('anki-review-done').textContent).toContain('Done for today')
    expect(screen.getByTestId('anki-review-done').textContent).toContain('Next card due tomorrow')
  })

  it('should show the weekday date, not tomorrow, for a card due Monday when today is Saturday', () => {
    vi.setSystemTime(new Date(2026, 9, 31, 12))
    const monday = new Date(2026, 10, 2, 10).toISOString()

    render(<AnkiReviewDone nextDueAt={monday} noApprovedCards={false} />)

    expect(screen.getByTestId('anki-review-done').textContent).toContain('Next card due Monday, Nov 2')
    expect(screen.getByTestId('anki-review-done').textContent).not.toContain('tomorrow')
  })

  it('should not call a card due tonight a day away', () => {
    const tonight = new Date(Date.now() + (23 * 60 + 40) * 60_000).toISOString()

    render(<AnkiReviewDone nextDueAt={tonight} noApprovedCards={false} />)

    expect(screen.getByTestId('anki-review-done').textContent).toContain('Next card due in 24 hours')
  })

  it('should show scheduled message when no next due date', () => {
    render(<AnkiReviewDone nextDueAt={null} noApprovedCards={false} />)

    expect(screen.getByTestId('anki-review-done').textContent).toContain('No more cards are scheduled')
  })

  it('should show review count when cards were reviewed today', () => {
    vi.mocked(getDailyReviewCount).mockReturnValue(7)

    render(<AnkiReviewDone nextDueAt={null} noApprovedCards={false} />)

    expect(screen.getByTestId('anki-review-done').textContent).toContain('7 cards reviewed today')
  })

  it('should not show a local streak line so only the server streak appears', () => {
    vi.mocked(getDailyReviewCount).mockReturnValue(5)

    render(<AnkiReviewDone nextDueAt={null} noApprovedCards={false} />)

    expect(screen.getByTestId('anki-review-done').textContent).not.toContain('streak')
  })

  it('should not show review count when nothing was reviewed today', () => {
    vi.mocked(getDailyReviewCount).mockReturnValue(0)

    render(<AnkiReviewDone nextDueAt={null} noApprovedCards={false} />)

    const text = screen.getByTestId('anki-review-done').textContent ?? ''
    expect(text).not.toContain('reviewed today')
  })

  it('should tell the learner the daily new-card limit ended the session and link to settings', () => {
    render(<AnkiReviewDone nextDueAt={null} noApprovedCards={false} newLimitReached={true} />)

    const note = screen.getByTestId('anki-review-new-limit-reached')

    expect(note.textContent).toBe('Daily new-card limit reached. Change it in settings.')
    expect(note.querySelector('a')?.getAttribute('href')).toBe('/admin-settings')
  })

  it('should not mention the limit when the session ended because nothing was left', () => {
    render(<AnkiReviewDone nextDueAt={null} noApprovedCards={false} />)

    expect(screen.queryByTestId('anki-review-new-limit-reached')).toBeNull()
  })

  it('should show the subject forecast when the review was scoped to a subject', () => {
    render(<AnkiReviewDone nextDueAt={null} noApprovedCards={false} subjectId="subj_1" />)

    expect(screen.getByTestId('forecast-loader').textContent).toBe('subj_1')
  })

  it('should not request a forecast for reviews without a subject', () => {
    render(<AnkiReviewDone nextDueAt={null} noApprovedCards={false} />)

    expect(screen.queryByTestId('forecast-loader')).toBeNull()
  })
})
