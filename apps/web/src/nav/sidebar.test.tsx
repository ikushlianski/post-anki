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
  getPendingKnowledgeBitCountForNav: vi.fn(async () => ({ count: 0, attentionCount: 0, triageEnabled: true })),
}))

vi.mock('../chat-queue/chat-queue.api', () => ({
  getChatQueueCount: vi.fn(async () => ({ ok: true, data: { count: 3 } })),
}))

vi.mock('../curriculum/curriculum.api', () => ({
  getSubjectReviewDueCounts: vi.fn(async () => ({
    subjects: [],
    unsorted: { dueCount: 0, newCount: 0 },
    newRemainingToday: 0,
  })),
}))

vi.mock('../web-auth/web-auth.browser', () => ({ signOut: vi.fn(async () => true) }))

vi.mock('../shared/browser-time-zone', () => ({
  browserTimeZone: () => 'Europe/Berlin',
}))

import { act } from '@testing-library/react'

import { getChatQueueCount } from '../chat-queue/chat-queue.api'
import { getSubjectReviewDueCounts } from '../curriculum/curriculum.api'
import { getPendingKnowledgeBitCountForNav } from '../knowledge-bit/knowledge-bit-review.api'
import { PENDING_REVIEW_CHANGED_EVENT } from '../knowledge-bit/knowledge-bit-review-events'
import { Sidebar } from './sidebar'

afterEach(() => {
  cleanup()
})

describe('Sidebar', () => {
  it('should show Overview, the browser, Subjects, triage, the Set aside deck, Chat and review in that order', () => {
    render(<Sidebar />)

    const links = screen.getAllByRole('link')

    expect(links.map((link) => link.getAttribute('data-to'))).toEqual([
      '/add-knowledge',
      '/',
      '/knowledge/browser',
      '/subjects',
      '/knowledge-bit-review',
      '/knowledge/inbox',
      '/knowledge/chat',
      '/knowledge/review',
      '/statistics',
      '/sources',
      '/admin-settings',
    ])
    expect(links.map((link) => link.textContent?.split(' (')[0].replace(/\d+$/, ''))).toEqual([
      '+Add knowledge',
      'Overview',
      'All cards',
      'Subjects',
      'Knowledge triage',
      'Set aside',
      'Chat',
      'Review',
      'Statistics',
      'Sources',
      'Admin settings',
    ])
  })

  it('should explain what Set aside holds in a tooltip', () => {
    render(<Sidebar />)

    expect(screen.getByTestId('nav-knowledge-inbox').getAttribute('title')).toContain('set aside during triage')
  })

  it('should offer a single Statistics entry and no separate Stats entry', () => {
    render(<Sidebar />)

    expect(screen.queryByTestId('nav-stats')).toBeNull()
    expect(screen.getByTestId('nav-statistics').getAttribute('data-to')).toBe('/statistics')
  })

  it('should pin Admin settings as the last link', () => {
    render(<Sidebar />)

    const links = screen.getAllByRole('link')

    expect(links[links.length - 1]).toBe(screen.getByTestId('nav-admin-settings'))
  })

  it('should give every nav link except Add knowledge a decorative icon', () => {
    render(<Sidebar />)

    const ids = [
      'nav-overview',
      'nav-knowledge-browser',
      'nav-subjects',
      'nav-knowledge-bit-review',
      'nav-knowledge-inbox',
      'nav-knowledge-review',
      'nav-statistics',
      'nav-sources',
      'nav-admin-settings',
    ]

    for (const id of ids) {
      const icon = screen.getByTestId(id).querySelector('svg[data-nav-icon]')

      expect(icon?.getAttribute('aria-hidden')).toBe('true')
    }
  })

  it('should show the pending count on the Knowledge triage link', async () => {
    render(<Sidebar />)

    await waitFor(() => {
      expect(screen.getByTestId('nav-knowledge-bit-review').textContent).toBe('Knowledge triage (0)')
    })
  })

  it('should show the Set aside count after triage and refresh it when items move', async () => {
    vi.mocked(getPendingKnowledgeBitCountForNav).mockResolvedValueOnce({
      count: 1,
      attentionCount: 0,
      inboxCount: 2,
      triageEnabled: true,
    })
    render(<Sidebar />)

    await waitFor(() => {
      expect(screen.getByTestId('nav-knowledge-inbox').textContent).toBe('Set aside (2)')
    })

    vi.mocked(getPendingKnowledgeBitCountForNav).mockResolvedValueOnce({
      count: 0,
      attentionCount: 0,
      inboxCount: 3,
      triageEnabled: true,
    })
    act(() => {
      window.dispatchEvent(new Event(PENDING_REVIEW_CHANGED_EVENT))
    })

    await waitFor(() => {
      expect(screen.getByTestId('nav-knowledge-inbox').textContent).toBe('Set aside (3)')
    })
  })

  it('should add notes that need attention to the triage count and show a dot', async () => {
    vi.mocked(getPendingKnowledgeBitCountForNav).mockResolvedValueOnce({ count: 2, attentionCount: 1, inboxCount: 0, triageEnabled: true })

    render(<Sidebar />)

    await waitFor(() => {
      expect(screen.getByTestId('nav-knowledge-bit-review').textContent).toBe('Knowledge triage (3)')
    })
    expect(screen.getByTestId('nav-knowledge-bit-review-attention-dot')).toBeTruthy()
  })

  it('should never read zero while only a failed note is waiting', async () => {
    vi.mocked(getPendingKnowledgeBitCountForNav).mockResolvedValueOnce({ count: 0, attentionCount: 2, inboxCount: 0, triageEnabled: true })

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

  it('should show how many parked cards wait in Chat as a labelled badge', async () => {
    render(<Sidebar />)

    const badge = await screen.findByTestId('nav-knowledge-chat-badge')

    expect(badge.textContent).toBe('3')
    expect(badge.getAttribute('aria-label')).toBe('3 cards waiting in Chat')
  })

  it('should cap the Chat badge at 99+', async () => {
    vi.mocked(getChatQueueCount).mockResolvedValueOnce({ ok: true, data: { count: 150 } })
    render(<Sidebar />)

    const badge = await screen.findByTestId('nav-knowledge-chat-badge')

    expect(badge.textContent).toBe('99+')
    expect(badge.getAttribute('aria-label')).toBe('150 cards waiting in Chat')
  })

  it('should hide the Chat badge when nothing waits', async () => {
    vi.mocked(getChatQueueCount).mockResolvedValueOnce({ ok: true, data: { count: 0 } })
    render(<Sidebar />)

    await waitFor(() => {
      expect(vi.mocked(getChatQueueCount)).toHaveBeenCalled()
    })

    expect(screen.queryByTestId('nav-knowledge-chat-badge')).toBeNull()
  })

  it('should refresh the Chat badge when a Chat card is resolved', async () => {
    render(<Sidebar />)
    await screen.findByTestId('nav-knowledge-chat-badge')

    vi.mocked(getChatQueueCount).mockResolvedValueOnce({ ok: true, data: { count: 2 } })
    act(() => {
      window.dispatchEvent(new Event(PENDING_REVIEW_CHANGED_EVENT))
    })

    await waitFor(() => {
      expect(screen.getByTestId('nav-knowledge-chat-badge').textContent).toBe('2')
    })
  })

  it('should leave Profile and Sign out to the top bar', () => {
    render(<Sidebar />)

    expect(screen.queryByTestId('nav-profile')).toBeNull()
    expect(screen.queryByTestId('nav-sign-out')).toBeNull()
  })
  it('should hide the triage link when triage is off and nothing is waiting', async () => {
    vi.mocked(getPendingKnowledgeBitCountForNav).mockResolvedValueOnce({
      count: 0,
      attentionCount: 0,
      inboxCount: 0,
      triageEnabled: false,
    })
    render(<Sidebar />)

    await waitFor(() => expect(screen.queryByTestId('nav-knowledge-bit-review')).toBeNull())
    expect(screen.getByTestId('nav-knowledge-inbox')).toBeTruthy()
  })

  it('should keep the triage link while triage is off but cards are still waiting', async () => {
    vi.mocked(getPendingKnowledgeBitCountForNav).mockResolvedValueOnce({
      count: 4,
      attentionCount: 0,
      inboxCount: 0,
      triageEnabled: false,
    })
    render(<Sidebar />)

    await waitFor(() => expect(screen.getByTestId('nav-knowledge-bit-review').textContent).toBe('Knowledge triage (4)'))
  })
})
