// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'

vi.mock('@tanstack/react-router', () => ({
  Link: ({ children, to }: { children: React.ReactNode; to: string }) => (
    <a href={to}>{children}</a>
  ),
}))

vi.mock('./daily-review-storage', () => ({
  getDailyReviewCount: vi.fn(() => 0),
  getStudyStreak: vi.fn(() => 0),
}))

import { getDailyReviewCount, getStudyStreak } from './daily-review-storage'
import { AnkiReviewDone } from './anki-review-done'

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
})

describe('AnkiReviewDone', () => {
  it('should show empty state when no approved cards exist', () => {
    render(<AnkiReviewDone nextDueAt={null} noApprovedCards={true} />)

    expect(screen.getByTestId('anki-review-empty').textContent).toBe('No cards to review yet')
  })

  it('should show done state with next-due when cards exist', () => {
    const future = new Date(Date.now() + 25 * 3600 * 1000).toISOString()
    render(<AnkiReviewDone nextDueAt={future} noApprovedCards={false} />)

    expect(screen.getByTestId('anki-review-done').textContent).toContain('Done for today')
    expect(screen.getByTestId('anki-review-done').textContent).toContain('Next card due')
  })

  it('should show scheduled message when no next due date', () => {
    render(<AnkiReviewDone nextDueAt={null} noApprovedCards={false} />)

    expect(screen.getByTestId('anki-review-done').textContent).toContain('No more cards are scheduled')
  })

  it('should show review count when cards were reviewed today', () => {
    vi.mocked(getDailyReviewCount).mockReturnValue(7)
    vi.mocked(getStudyStreak).mockReturnValue(1)

    render(<AnkiReviewDone nextDueAt={null} noApprovedCards={false} />)

    expect(screen.getByTestId('anki-review-done').textContent).toContain('7 cards reviewed today')
  })

  it('should show streak when streak is greater than one', () => {
    vi.mocked(getDailyReviewCount).mockReturnValue(5)
    vi.mocked(getStudyStreak).mockReturnValue(4)

    render(<AnkiReviewDone nextDueAt={null} noApprovedCards={false} />)

    expect(screen.getByTestId('anki-review-done').textContent).toContain('4 day streak')
  })

  it('should not show streak line when nothing was reviewed today', () => {
    vi.mocked(getDailyReviewCount).mockReturnValue(0)
    vi.mocked(getStudyStreak).mockReturnValue(3)

    render(<AnkiReviewDone nextDueAt={null} noApprovedCards={false} />)

    const text = screen.getByTestId('anki-review-done').textContent ?? ''
    expect(text).not.toContain('day streak')
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
})
