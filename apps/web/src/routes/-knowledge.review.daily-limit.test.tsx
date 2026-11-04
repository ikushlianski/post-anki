// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { ReactNode } from 'react'
import type { ReviewCard, ReviewCardsResponse } from '@post-anki/shared'

const searchState = vi.hoisted(() => ({
  current: {} as { tagId?: string; topicId?: string; knowledgeBitId?: string },
}))

vi.mock('@tanstack/react-router', () => ({
  createFileRoute: () => (config: { component: () => ReactNode }) => ({
    useSearch: () => searchState.current,
    component: config.component,
  }),
  Link: ({
    children,
    to,
    search,
    activeOptions: _activeOptions,
    ...rest
  }: {
    children: ReactNode
    to?: string
    search?: Record<string, unknown>
    activeOptions?: unknown
  } & Record<string, unknown>) => (
    <a href="#" data-to={to} data-search={search ? JSON.stringify(search) : undefined} {...rest}>
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
  background: 'Covered in the networking module.',
  isAiGenerated: false,
  sourceLinks: [],
  phase: 'new',
  leech: false,
  intervalPreview: { again: 86_400, hard: 86_400, good: 86_400, easy: 345_600 },
}

const secondCard: ReviewCard = {
  variantId: 'variant-2',
  knowledgeBitId: 'bit-2',
  kind: 'wh_question',
  prompt: 'What does UDP stand for?',
  answer: 'User Datagram Protocol',
  background: null,
  isAiGenerated: false,
  sourceLinks: [],
  phase: 'review',
  leech: false,
  intervalPreview: { again: 600, hard: 86_400, good: 3 * 86_400, easy: 36 * 86_400 },
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
  cardKey: '',
  buriedVariantIds: [],
  knowledgeBitId: 'bit-1',
  phase: 'review' as const,
  dueAt: '2026-10-11T12:00:00.000Z',
  intervalDays: 1,
  lapses: 0,
  leech: false,
  suspended: false,
  points: { awarded: 3, reason: 'awarded' as const, totalPoints: 3, level: 1, leveledUp: false },
}

function renderPage() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  const tree = () => (
    <QueryClientProvider client={queryClient}>
      <ReviewPage />
    </QueryClientProvider>
  )
  const view = render(tree())

  return { ...view, rerenderPage: () => view.rerender(tree()) }
}

afterEach(() => {
  cleanup()
  vi.resetAllMocks()
  searchState.current = {}
})

async function gradeFirstCard() {
  await userEvent.click(await screen.findByTestId('anki-review-show-answer'))
  await userEvent.click(screen.getByTestId('anki-review-grade-good'))
}

const limitState = { limitReached: true, reviewedToday: 200, limit: 200 }

describe('Anki review daily limit', () => {
  it('should end the session with a done-for-today message when the limit is already reached', async () => {
    mockedGetReviewCards.mockResolvedValue(queueResponse([], limitState))

    renderPage()

    expect((await screen.findByTestId('anki-review-limit-summary')).textContent).toBe(
      'You reviewed 200 of 200 cards today.',
    )
    expect(screen.getByText('Done for today')).toBeTruthy()
    expect(screen.getByTestId('anki-review-limit-back')).toBeTruthy()
    expect(screen.queryByTestId('anki-review-empty')).toBeNull()
  })

  it('should end the session in the same state when a refill reports the limit reached', async () => {
    mockedGetReviewCards
      .mockResolvedValueOnce(queueResponse([firstCard]))
      .mockResolvedValue(queueResponse([], limitState))
    mockedSubmitReview.mockResolvedValue(savedGrade)

    renderPage()
    await gradeFirstCard()

    expect((await screen.findByTestId('anki-review-limit-summary')).textContent).toContain('200 of 200')
  })

  it('should fetch cards due within the chosen number of days when the learner reviews ahead', async () => {
    mockedGetReviewCards.mockImplementation(async ({ data }) =>
      data.aheadDays === 3 ? queueResponse([secondCard], limitState) : queueResponse([], limitState),
    )

    renderPage()
    await userEvent.click(await screen.findByTestId('anki-review-ahead-3'))

    expect(await screen.findByText(secondCard.prompt)).toBeTruthy()
    expect(mockedGetReviewCards).toHaveBeenLastCalledWith({ data: expect.objectContaining({ aheadDays: 3 }) })
  })

  it('should offer review-ahead choices of 1, 2, 3 and 5 days', async () => {
    mockedGetReviewCards.mockResolvedValue(queueResponse([], limitState))

    renderPage()
    await screen.findByTestId('anki-review-limit-reached')

    for (const days of [1, 2, 3, 5]) {
      expect(screen.getByTestId(`anki-review-ahead-${days}`)).toBeTruthy()
    }
  })

  it('should show the ordinary done state when nothing is due and the limit is not reached', async () => {
    mockedGetReviewCards.mockResolvedValue(queueResponse([], { nextDueAt: '2026-11-10T00:00:00.000Z' }))

    renderPage()

    expect(await screen.findByTestId('anki-review-done')).toBeTruthy()
    expect(screen.queryByTestId('anki-review-limit-reached')).toBeNull()
  })
})
