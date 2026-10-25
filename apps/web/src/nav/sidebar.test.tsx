// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen, waitFor } from '@testing-library/react'
import type { ReactNode } from 'react'

vi.mock('@tanstack/react-router', () => ({
  Link: ({
    children,
    to,
    search,
    activeOptions: _activeOptions,
    ...rest
  }: {
    children: ReactNode
    to?: string
    search?: { view?: string }
    activeOptions?: unknown
  } & Record<string, unknown>) => (
    <a href="#" data-to={to} data-view={search?.view} {...rest}>
      {children}
    </a>
  ),
}))

vi.mock('../knowledge-bit/knowledge-bit-review.api', () => ({
  getPendingKnowledgeBitCountForNav: vi.fn(async () => ({ count: 0, attentionCount: 0 })),
}))

vi.mock('../curriculum/curriculum.api', () => ({
  getSubjectReviewDueCounts: vi.fn(async () => ({
    subjects: [],
    unsorted: { dueCount: 0, newCount: 0 },
    newRemainingToday: 0,
  })),
}))

vi.mock('../web-auth/web-auth.browser', () => ({ signOut: vi.fn(async () => true) }))

vi.mock('../knowledge-bit/anki-review-session-actions', () => ({
  browserTimeZone: () => 'Europe/Berlin',
}))

import { act } from '@testing-library/react'

import { getSubjectReviewDueCounts } from '../curriculum/curriculum.api'
import { getPendingKnowledgeBitCountForNav } from '../knowledge-bit/knowledge-bit-review.api'
import { PENDING_REVIEW_CHANGED_EVENT } from '../knowledge-bit/knowledge-bit-review-events'
import { Sidebar } from './sidebar'
import { signOut } from '../web-auth/web-auth.browser'

afterEach(() => {
  cleanup()
})

describe('Sidebar', () => {
  it('should show the browser, the Subjects entry, inbox and review in that order', () => {
    render(<Sidebar />)

    const links = screen.getAllByRole('link')

    expect(links.map((link) => link.getAttribute('data-to'))).toEqual([
      '/add-knowledge',
      '/knowledge/browser',
      '/knowledge/browser',
      '/knowledge-bit-review',
      '/knowledge/review',
      '/profile',
    ])
    expect(links.map((link) => link.textContent?.split(' (')[0])).toEqual([
      '+Add knowledge',
      'Knowledge browser',
      'Subjects',
      'Knowledge triage',
      'Review',
      'Profile',
    ])
  })

  it('should open the all-cards table from Knowledge browser and the subject list from Subjects', () => {
    render(<Sidebar />)

    expect(screen.getByTestId('nav-knowledge-browser').getAttribute('data-view')).toBeNull()
    expect(screen.getByTestId('nav-subjects').getAttribute('data-view')).toBe('subjects')
  })

  it('should show the pending count on the Knowledge triage link', async () => {
    render(<Sidebar />)

    await waitFor(() => {
      expect(screen.getByTestId('nav-knowledge-bit-review').textContent).toBe('Knowledge triage (0)')
    })
  })

  it('should add notes that need attention to the triage count and show a dot', async () => {
    vi.mocked(getPendingKnowledgeBitCountForNav).mockResolvedValueOnce({ count: 2, attentionCount: 1 })

    render(<Sidebar />)

    await waitFor(() => {
      expect(screen.getByTestId('nav-knowledge-bit-review').textContent).toBe('Knowledge triage (3)')
    })
    expect(screen.getByTestId('nav-knowledge-bit-review-attention-dot')).toBeTruthy()
  })

  it('should never read zero while only a failed note is waiting', async () => {
    vi.mocked(getPendingKnowledgeBitCountForNav).mockResolvedValueOnce({ count: 0, attentionCount: 2 })

    render(<Sidebar />)

    await waitFor(() => {
      expect(screen.getByTestId('nav-knowledge-bit-review').textContent).toBe('Knowledge triage (2)')
    })
  })

  it('should show no dot when nothing needs attention', async () => {
    render(<Sidebar />)

    await waitFor(() => {
      expect(screen.getByTestId('nav-knowledge-bit-review').textContent).toBe('Knowledge triage (0)')
    })
    expect(screen.queryByTestId('nav-knowledge-bit-review-attention-dot')).toBeNull()
  })

  it('should show Review with no count when zero due', async () => {
    vi.mocked(getSubjectReviewDueCounts).mockResolvedValueOnce({
      subjects: [],
      unsorted: { dueCount: 0, newCount: 0 },
      newRemainingToday: 0,
    })

    render(<Sidebar />)

    await waitFor(() => {
      expect(screen.getByTestId('nav-knowledge-review').textContent).toBe('Review')
    })
  })

  it('should show Review (2 due · 3 new) when two cards are due and three new remain', async () => {
    vi.mocked(getSubjectReviewDueCounts).mockResolvedValueOnce({
      subjects: [{ subjectId: 's1', dueCount: 2, newCount: 0 }],
      unsorted: { dueCount: 0, newCount: 0 },
      newRemainingToday: 3,
    })

    render(<Sidebar />)

    await waitFor(() => {
      expect(screen.getByTestId('nav-knowledge-review').textContent).toBe('Review (2 due · 3 new)')
    })
  })

  it('should ask for counts on the learner local day, not UTC', async () => {
    render(<Sidebar />)

    await waitFor(() => {
      expect(getSubjectReviewDueCounts).toHaveBeenCalledWith({ data: { tz: 'Europe/Berlin' } })
    })
  })

  it('should update the count when a grade, undo, bury, suspend or approve fires the change event', async () => {
    vi.mocked(getSubjectReviewDueCounts)
      .mockResolvedValueOnce({
        subjects: [{ subjectId: 's1', dueCount: 2, newCount: 0 }],
        unsorted: { dueCount: 0, newCount: 0 },
        newRemainingToday: 0,
      })
      .mockResolvedValueOnce({
        subjects: [{ subjectId: 's1', dueCount: 1, newCount: 0 }],
        unsorted: { dueCount: 0, newCount: 0 },
        newRemainingToday: 0,
      })

    render(<Sidebar />)

    await waitFor(() => {
      expect(screen.getByTestId('nav-knowledge-review').textContent).toBe('Review (2 due)')
    })

    act(() => {
      window.dispatchEvent(new Event(PENDING_REVIEW_CHANGED_EVENT))
    })

    await waitFor(() => {
      expect(screen.getByTestId('nav-knowledge-review').textContent).toBe('Review (1 due)')
    })
  })

  it('should keep the last counts when a refresh fails', async () => {
    vi.mocked(getSubjectReviewDueCounts)
      .mockResolvedValueOnce({
        subjects: [{ subjectId: 's1', dueCount: 2, newCount: 0 }],
        unsorted: { dueCount: 0, newCount: 0 },
        newRemainingToday: 0,
      })
      .mockRejectedValueOnce(new Error('network'))

    render(<Sidebar />)

    await waitFor(() => {
      expect(screen.getByTestId('nav-knowledge-review').textContent).toBe('Review (2 due)')
    })

    const callsBefore = vi.mocked(getSubjectReviewDueCounts).mock.calls.length

    act(() => {
      window.dispatchEvent(new Event(PENDING_REVIEW_CHANGED_EVENT))
    })

    await waitFor(() => {
      expect(vi.mocked(getSubjectReviewDueCounts).mock.calls.length).toBe(callsBefore + 1)
    })

    expect(screen.getByTestId('nav-knowledge-review').textContent).toBe('Review (2 due)')
  })

  it('should show the newest counts when an older reply arrives last during fast grading', async () => {
    type Counts = Awaited<ReturnType<typeof getSubjectReviewDueCounts>>
    const counts = (due: number): Counts => ({
      subjects: [{ subjectId: 's1', dueCount: due, newCount: 0 }],
      unsorted: { dueCount: 0, newCount: 0 },
      newRemainingToday: 0,
    })
    let resolveFirst: (value: Counts) => void = () => {}

    vi.mocked(getSubjectReviewDueCounts)
      .mockImplementationOnce(() => new Promise<Counts>((resolve) => { resolveFirst = resolve }))
      .mockResolvedValueOnce(counts(1))

    render(<Sidebar />)

    act(() => {
      window.dispatchEvent(new Event(PENDING_REVIEW_CHANGED_EVENT))
    })

    await waitFor(() => {
      expect(screen.getByTestId('nav-knowledge-review').textContent).toBe('Review (1 due)')
    })

    await act(async () => {
      resolveFirst(counts(2))
    })

    expect(screen.getByTestId('nav-knowledge-review').textContent).toBe('Review (1 due)')
  })

  it('should show Review (5 new) when only new cards remain', async () => {
    vi.mocked(getSubjectReviewDueCounts).mockResolvedValueOnce({
      subjects: [],
      unsorted: { dueCount: 0, newCount: 0 },
      newRemainingToday: 5,
    })

    render(<Sidebar />)

    await waitFor(() => {
      expect(screen.getByTestId('nav-knowledge-review').textContent).toBe('Review (5 new)')
    })
  })

  it('should end the session when Sign out is pressed', async () => {
    const { fireEvent } = await import('@testing-library/react')

    render(<Sidebar />)
    fireEvent.click(screen.getByTestId('nav-sign-out'))

    expect(signOut).toHaveBeenCalledTimes(1)
  })
})
