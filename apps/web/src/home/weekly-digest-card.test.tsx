// @vitest-environment jsdom
import type { ReactNode } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen, waitFor } from '@testing-library/react'

import type { WeeklyDigestCard as WeeklyDigestCardData } from '@post-anki/shared'

vi.mock('@tanstack/react-router', () => ({
  Link: ({ children, to, search, ...rest }: { children: ReactNode; to: string; search?: { reason?: string } }) => (
    <a href={search?.reason ? `${to}?reason=${search.reason}` : to} {...rest}>
      {children}
    </a>
  ),
}))

vi.mock('../analytics/analytics.api', () => ({ getWeeklyDigestCard: vi.fn() }))

import { getWeeklyDigestCard } from '../analytics/analytics.api'
import { WeeklyDigestCard } from './weekly-digest-card'

afterEach(cleanup)

function digest(overrides: Partial<WeeklyDigestCardData> = {}): WeeklyDigestCardData {
  return {
    current: { accepted: 8, rejected: 2, reviewed: 30 },
    previous: { accepted: 5, rejected: 2, reviewed: 40 },
    chatBacklog: 6,
    windowStart: '2026-10-22T00:00:00.000Z',
    windowEnd: '2026-10-29T00:00:00.000Z',
    ...overrides,
  }
}

describe('WeeklyDigestCard', () => {
  it('should show the four numbers with worded deltas and a link to the Chat backlog', async () => {
    vi.mocked(getWeeklyDigestCard).mockResolvedValue(digest())
    render(<WeeklyDigestCard />)

    expect(screen.getByText('Loading...').getAttribute('role')).toBe('status')
    await waitFor(() => expect(screen.getByTestId('weekly-digest-accepted')).toBeTruthy())
    expect(screen.getByTestId('weekly-digest-accepted').textContent).toContain('up 3 from last week')
    expect(screen.getByTestId('weekly-digest-rejected').textContent).toContain('same as last week')
    expect(screen.getByTestId('weekly-digest-reviewed').textContent).toContain('down 10 from last week')
    expect(screen.getByTestId('weekly-digest-backlog').textContent).toContain('6')
    expect(screen.getByRole('link', { name: 'Open Chat' }).getAttribute('href')).toBe('/knowledge/chat')
  })

  it('should show the weekly chat line only when there were chat turns', async () => {
    vi.mocked(getWeeklyDigestCard).mockResolvedValue(digest({ chatCards: 2, chatTurns: 5 }))
    render(<WeeklyDigestCard />)

    expect((await screen.findByTestId('weekly-digest-chat-activity')).textContent).toBe('Chat: 2 cards, 5 turns this week')

    cleanup()
    vi.mocked(getWeeklyDigestCard).mockResolvedValue(digest({ chatCards: 0, chatTurns: 0 }))
    render(<WeeklyDigestCard />)
    await screen.findByTestId('weekly-digest-backlog')

    expect(screen.queryByTestId('weekly-digest-chat-activity')).toBeNull()
  })

  it('should say there is no activity when both weeks and the backlog are empty', async () => {
    vi.mocked(getWeeklyDigestCard).mockResolvedValue(
      digest({
        current: { accepted: 0, rejected: 0, reviewed: 0 },
        previous: { accepted: 0, rejected: 0, reviewed: 0 },
        chatBacklog: 0,
      }),
    )
    render(<WeeklyDigestCard />)

    await waitFor(() => expect(screen.getByTestId('weekly-digest-empty')).toBeTruthy())
  })

  it('should offer a retry when loading fails', async () => {
    vi.mocked(getWeeklyDigestCard).mockRejectedValueOnce(new Error('boom'))
    render(<WeeklyDigestCard />)

    await waitFor(() => expect(screen.getByTestId('weekly-digest-error').getAttribute('role')).toBe('alert'))
    vi.mocked(getWeeklyDigestCard).mockResolvedValue(digest())
    screen.getByRole('button', { name: 'Try again' }).click()
    await waitFor(() => expect(screen.getByTestId('weekly-digest-accepted')).toBeTruthy())
  })

  it('should link each top reject reason to the Rejected cards page filtered by that reason', async () => {
    vi.mocked(getWeeklyDigestCard).mockResolvedValue(
      digest({
        topRejectReasons: [
          { reason: 'wrong_language', count: 4 },
          { reason: 'unspecified', count: 2 },
        ],
      }),
    )
    render(<WeeklyDigestCard />)

    await waitFor(() => expect(screen.getByTestId('weekly-digest-reject-reasons')).toBeTruthy())
    expect(screen.getByRole('link', { name: 'Wrong language' }).getAttribute('href')).toBe(
      '/knowledge/rejected?reason=wrong_language',
    )
    expect(screen.getByTestId('weekly-digest-reject-reasons').textContent).toContain('(4)')
    expect(screen.getAllByRole('link').some((a) => a.getAttribute('href') === '/knowledge/rejected?reason=unspecified')).toBe(true)
  })

  it('should show the signed change versus last week per reason and nothing when 0 or absent', async () => {
    vi.mocked(getWeeklyDigestCard).mockResolvedValue(
      digest({
        topRejectReasons: [
          { reason: 'wrong_language', count: 4, delta: 3 },
          { reason: 'bad_format', count: 2, delta: -2 },
          { reason: 'other', count: 1, delta: 0 },
          { reason: 'unspecified', count: 1 },
        ],
      }),
    )
    render(<WeeklyDigestCard />)

    await waitFor(() => expect(screen.getByTestId('weekly-digest-reject-reasons')).toBeTruthy())
    expect(screen.getByTestId('weekly-digest-reason-delta-wrong_language').textContent).toBe('+3')
    expect(screen.getByTestId('weekly-digest-reason-delta-bad_format').textContent).toBe('-2')
    expect(screen.queryByTestId('weekly-digest-reason-delta-other')).toBeNull()
    expect(screen.queryByTestId('weekly-digest-reason-delta-unspecified')).toBeNull()
  })

  it('should hide the reject reasons block when the digest has none', async () => {
    vi.mocked(getWeeklyDigestCard).mockResolvedValue(digest({ topRejectReasons: [] }))
    render(<WeeklyDigestCard />)

    await waitFor(() => expect(screen.getByTestId('weekly-digest-accepted')).toBeTruthy())
    expect(screen.queryByTestId('weekly-digest-reject-reasons')).toBeNull()
  })
})
