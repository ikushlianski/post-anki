// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { ReactNode } from 'react'
import type { ReviewCard, ReviewCardsResponse } from '@post-anki/shared'

vi.mock('@tanstack/react-router', () => ({
  createFileRoute: () => (config: { component: () => ReactNode }) => ({
    useSearch: () => ({}),
    component: config.component,
  }),
  Link: ({
    children,
    to,
    search: _search,
    activeOptions: _activeOptions,
    ...rest
  }: {
    children: ReactNode
    to?: string
    search?: unknown
    activeOptions?: unknown
  } & Record<string, unknown>) => (
    <a href="#" data-to={to} {...rest}>
      {children}
    </a>
  ),
}))

vi.mock('@tanstack/react-db', () => ({
  useLiveQuery: () => ({ data: [] }),
}))

vi.mock('../curriculum/board.collection', () => ({
  curriculaCollection: {},
}))

vi.mock('../knowledge-bit/anki-review.api')
vi.mock('../knowledge-bit/knowledge-bit-chat.api')

import { getReviewCards, submitReview } from '../knowledge-bit/anki-review.api'
import { Route } from './knowledge.review'

const mockedGetReviewCards = vi.mocked(getReviewCards)
const mockedSubmitReview = vi.mocked(submitReview)

const ReviewPage = (Route as unknown as { component: () => ReactNode }).component

const firstCard: ReviewCard = {
  variantId: 'variant-1',
  knowledgeBitId: 'bit-1',
  kind: 'wh_question',
  prompt: 'Why does TCP use a handshake?',
  answer: 'To agree on sequence numbers before sending data.',
  background: null,
  phase: 'new',
  leech: false,
  intervalPreview: { again: 600, hard: 86_400, good: 3 * 86_400, easy: 36 * 86_400 },
}

const secondCard: ReviewCard = {
  ...firstCard,
  variantId: 'variant-2',
  knowledgeBitId: 'bit-2',
  prompt: 'UDP is ____ oriented.',
  answer: 'message',
  phase: 'review',
}

function queueResponse(
  cards: ReviewCard[],
  overrides: Partial<ReviewCardsResponse> = {},
): { ok: true } & ReviewCardsResponse {
  return {
    ok: true,
    cards,
    counts: { new: 0, learning: 0, review: 0 },
    newRemainingToday: 20,
    nextDueAt: null,
    ...overrides,
  }
}

const savedGrade = {
  ok: true as const,
  reviewId: 'review-1',
  knowledgeBitId: 'bit-1',
  phase: 'review' as const,
  dueAt: '2026-10-11T12:00:00.000Z',
  intervalDays: 1,
  lapses: 0,
  leech: false,
  suspended: false,
}

function renderPage() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })

  render(
    <QueryClientProvider client={queryClient}>
      <ReviewPage />
    </QueryClientProvider>,
  )
}

afterEach(() => {
  cleanup()
  vi.resetAllMocks()
})

describe('Anki review feedback and next steps', () => {
  it('should move keyboard focus to the next card Show answer button after grading', async () => {
    mockedGetReviewCards.mockResolvedValue(queueResponse([firstCard, secondCard]))
    mockedSubmitReview.mockResolvedValue(savedGrade)

    renderPage()
    await userEvent.click(await screen.findByTestId('anki-review-show-answer'))
    await userEvent.click(screen.getByTestId('anki-review-grade-good'))
    await screen.findByText(secondCard.prompt)

    expect(document.activeElement).toBe(screen.getByTestId('anki-review-show-answer'))
  })

  it('should resend the same grade with the same request id when the learner presses Retry', async () => {
    mockedGetReviewCards.mockResolvedValue(queueResponse([firstCard, secondCard]))
    mockedSubmitReview
      .mockResolvedValueOnce({ ok: false, error: 'network_error' })
      .mockResolvedValueOnce(savedGrade)

    renderPage()
    await userEvent.click(await screen.findByTestId('anki-review-show-answer'))
    await userEvent.click(screen.getByTestId('anki-review-grade-good'))
    await userEvent.click(await screen.findByTestId('anki-review-grade-retry'))

    expect(await screen.findByText(secondCard.prompt)).toBeTruthy()
    const sent = mockedSubmitReview.mock.calls.map(([input]) => input.data)
    expect(sent).toHaveLength(2)
    expect(sent[1]).toMatchObject({ variantId: 'variant-1', grade: 'good', requestId: sent[0]?.requestId })
  })

  it('should not offer Retry when the grade error cannot be fixed by retrying', async () => {
    mockedGetReviewCards.mockResolvedValue(queueResponse([firstCard]))
    mockedSubmitReview.mockResolvedValueOnce({ ok: false, error: 'not_approved' })

    renderPage()
    await userEvent.click(await screen.findByTestId('anki-review-show-answer'))
    await userEvent.click(screen.getByTestId('anki-review-grade-good'))

    expect(await screen.findByTestId('anki-review-grade-error')).toBeTruthy()
    expect(screen.queryByTestId('anki-review-grade-retry')).toBeNull()
  })

  it('should offer Add knowledge and Approve suggestions as next steps on the done-for-today screen', async () => {
    mockedGetReviewCards.mockResolvedValue(
      queueResponse([], { nextDueAt: '2026-10-11T12:00:00.000Z', counts: { new: 0, learning: 0, review: 1 } }),
    )

    renderPage()

    const done = await screen.findByTestId('anki-review-done')

    expect(done.textContent).toContain('Done for today')
    expect(screen.getByRole('link', { name: 'Add knowledge' }).getAttribute('data-to')).toBe('/add-knowledge')
    expect(screen.getByRole('link', { name: 'Approve suggestions' }).getAttribute('data-to')).toBe(
      '/knowledge-bit-review',
    )
  })

  it('should explain what New, Learning and Due mean under the counts', async () => {
    mockedGetReviewCards.mockResolvedValue(queueResponse([firstCard], { counts: { new: 1, learning: 0, review: 0 } }))

    renderPage()

    expect((await screen.findByTestId('anki-review-counts-legend')).textContent).toContain('New:')
    expect(screen.getByTestId('anki-review-counts-legend').textContent).toContain('Due:')
  })

  it('should explain why End session is disabled before any card is reviewed', async () => {
    mockedGetReviewCards.mockResolvedValue(queueResponse([firstCard]))

    renderPage()

    const end = await screen.findByTestId('anki-review-end-session')

    expect((end as HTMLButtonElement).disabled).toBe(true)
    expect(end.getAttribute('title')).toBe('Review at least one card to end the session')
  })

  it('should announce the leech marker to screen readers', async () => {
    mockedGetReviewCards.mockResolvedValue(queueResponse([{ ...firstCard, leech: true }]))

    renderPage()

    expect((await screen.findByTestId('anki-review-leech')).getAttribute('role')).toBe('status')
  })

  it('should announce the session notice politely to screen readers', async () => {
    mockedGetReviewCards.mockResolvedValue(queueResponse([firstCard, secondCard]))
    mockedSubmitReview.mockResolvedValue({ ...savedGrade, leech: true, suspended: true })

    renderPage()
    await userEvent.click(await screen.findByTestId('anki-review-show-answer'))
    await userEvent.click(screen.getByTestId('anki-review-grade-again'))

    const notice = await screen.findByTestId('anki-review-notice')

    expect(notice.closest('[aria-live="polite"]')?.getAttribute('role')).toBe('status')
  })
})
