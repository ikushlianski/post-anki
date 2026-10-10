// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
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
import { Sidebar } from '../nav/sidebar'
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
  phase: 'new',
  leech: false,
  intervalPreview: { again: 86_400, hard: 86_400, good: 86_400, easy: 345_600 },
}

const secondCard: ReviewCard = {
  variantId: 'variant-2',
  knowledgeBitId: 'bit-2',
  kind: 'fill_in_the_blank',
  prompt: 'UDP is ____ oriented.',
  answer: 'message',
  background: null,
  phase: 'review',
  leech: false,
  intervalPreview: { again: 600, hard: 86_400, good: 3 * 86_400, easy: 36 * 86_400 },
}

const firstCardSibling: ReviewCard = {
  ...secondCard,
  variantId: 'variant-3',
  prompt: 'What does SYN stand for?',
  answer: 'Synchronize.',
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

describe('Anki review page', () => {
  it('should show only the question until the learner reveals it, then the answer and four grades', async () => {
    mockedGetReviewCards.mockResolvedValue(queueResponse([firstCard]))

    renderPage()

    expect(await screen.findByText(firstCard.prompt)).toBeTruthy()
    expect(screen.queryByText(firstCard.answer)).toBeNull()
    expect(screen.queryByTestId('anki-review-grades')).toBeNull()

    await userEvent.click(screen.getByTestId('anki-review-show-answer'))

    expect(screen.getByText(firstCard.answer)).toBeTruthy()
    expect(screen.getByTestId('anki-review-grade-again')).toBeTruthy()
    expect(screen.getByTestId('anki-review-grade-easy').textContent).toContain('4')
  })

  it('should save the self-grade and move on to the next card, hidden again', async () => {
    mockedGetReviewCards.mockResolvedValue(queueResponse([firstCard, secondCard]))
    mockedSubmitReview.mockResolvedValue(savedGrade)

    renderPage()

    await userEvent.click(await screen.findByTestId('anki-review-show-answer'))
    await userEvent.click(screen.getByTestId('anki-review-grade-good'))

    expect(await screen.findByText(secondCard.prompt)).toBeTruthy()
    expect(screen.queryByText(secondCard.answer)).toBeNull()
    expect(mockedSubmitReview).toHaveBeenCalledWith({
      data: expect.objectContaining({ variantId: 'variant-1', grade: 'good' }),
    })
  })

  it('should load a fresh batch once the last card in the batch is graded', async () => {
    mockedGetReviewCards.mockResolvedValue(queueResponse([firstCard]))
    mockedSubmitReview.mockResolvedValue(savedGrade)

    renderPage()

    await userEvent.click(await screen.findByTestId('anki-review-show-answer'))
    await userEvent.click(screen.getByTestId('anki-review-grade-easy'))

    await waitFor(() => expect(mockedGetReviewCards).toHaveBeenCalledTimes(2))
  })

  it('should keep the background note hidden until reveal', async () => {
    mockedGetReviewCards.mockResolvedValue(queueResponse([firstCard]))

    renderPage()

    await screen.findByText(firstCard.prompt)

    expect(screen.queryByText('Covered in the networking module.')).toBeNull()

    await userEvent.click(screen.getByTestId('anki-review-show-answer'))

    expect(screen.getByTestId('anki-review-background').textContent).toBe(
      'Covered in the networking module.',
    )
  })

  it('should show the tutor chat only after reveal and hide it again on the next card', async () => {
    mockedGetReviewCards.mockResolvedValue(queueResponse([firstCard, secondCard]))
    mockedSubmitReview.mockResolvedValue(savedGrade)

    renderPage()

    await screen.findByText(firstCard.prompt)

    expect(screen.queryByTestId('knowledge-bit-chat-open')).toBeNull()

    await userEvent.click(screen.getByTestId('anki-review-show-answer'))

    expect(screen.getByTestId('knowledge-bit-chat-open')).toBeTruthy()

    await userEvent.click(screen.getByTestId('anki-review-grade-good'))
    await screen.findByText(secondCard.prompt)

    expect(screen.queryByTestId('knowledge-bit-chat-open')).toBeNull()
  })

  it('should let the learner reveal with Space and grade with 1-4, ignoring keys before reveal', async () => {
    mockedGetReviewCards.mockResolvedValue(queueResponse([firstCard, secondCard]))
    mockedSubmitReview.mockResolvedValue(savedGrade)

    renderPage()

    await screen.findByText(firstCard.prompt)

    fireEvent.keyDown(window, { key: '3' })
    expect(mockedSubmitReview).not.toHaveBeenCalled()

    fireEvent.keyDown(window, { key: ' ' })
    expect(screen.getByText(firstCard.answer)).toBeTruthy()

    fireEvent.keyDown(window, { key: '1' })

    expect(await screen.findByText(secondCard.prompt)).toBeTruthy()
    expect(mockedSubmitReview).toHaveBeenCalledTimes(1)
    expect(mockedSubmitReview).toHaveBeenCalledWith({
      data: expect.objectContaining({ variantId: 'variant-1', grade: 'again' }),
    })
  })

  it('should never grade from digits typed into the chat box', async () => {
    mockedGetReviewCards.mockResolvedValue(queueResponse([firstCard]))

    renderPage()

    await userEvent.click(await screen.findByTestId('anki-review-show-answer'))
    await userEvent.click(screen.getByTestId('knowledge-bit-chat-open'))
    await userEvent.type(screen.getByRole('textbox'), '1234')

    expect(mockedSubmitReview).not.toHaveBeenCalled()
  })

  it('should show a done-for-today screen with the next due time when the queue is empty', async () => {
    mockedGetReviewCards.mockResolvedValue(queueResponse([], { nextDueAt: '2026-10-11T12:00:00.000Z' }))

    renderPage()

    const done = await screen.findByTestId('anki-review-done')

    expect(done.textContent).toContain('Done for today')
    expect(done.textContent).toContain('Next card due')
    expect(screen.queryByText('Nothing to review right now.')).toBeNull()
  })

  it('should say no more cards are scheduled when nothing is due later either', async () => {
    mockedGetReviewCards.mockResolvedValue(queueResponse([]))

    renderPage()

    expect((await screen.findByTestId('anki-review-done')).textContent).toContain(
      'No more cards are scheduled.',
    )
  })

  it('should show the interval each grade would schedule, on its button, after reveal', async () => {
    mockedGetReviewCards.mockResolvedValue(queueResponse([secondCard]))

    renderPage()

    await userEvent.click(await screen.findByTestId('anki-review-show-answer'))

    expect(screen.getByTestId('anki-review-grade-again-interval').textContent).toBe('10m')
    expect(screen.getByTestId('anki-review-grade-hard-interval').textContent).toBe('1d')
    expect(screen.getByTestId('anki-review-grade-good-interval').textContent).toBe('3d')
    expect(screen.getByTestId('anki-review-grade-easy-interval').textContent).toBe('1.2mo')
  })

  it('should show new and due counts and lower them as cards are graded', async () => {
    mockedGetReviewCards.mockResolvedValue(
      queueResponse([firstCard, secondCard], { counts: { new: 3, learning: 0, review: 2 } }),
    )
    mockedSubmitReview.mockResolvedValue(savedGrade)

    renderPage()

    await screen.findByText(firstCard.prompt)

    expect(screen.getByTestId('anki-review-count-new').textContent).toBe('3')
    expect(screen.getByTestId('anki-review-count-learning').textContent).toBe('0')
    expect(screen.getByTestId('anki-review-count-review').textContent).toBe('2')

    await userEvent.click(screen.getByTestId('anki-review-show-answer'))
    await userEvent.click(screen.getByTestId('anki-review-grade-good'))
    await screen.findByText(secondCard.prompt)

    expect(screen.getByTestId('anki-review-count-new').textContent).toBe('2')
    expect(screen.getByTestId('anki-review-count-review').textContent).toBe('2')

    await userEvent.click(screen.getByTestId('anki-review-show-answer'))
    await userEvent.click(screen.getByTestId('anki-review-grade-good'))

    await waitFor(() => expect(mockedGetReviewCards).toHaveBeenCalledTimes(2))
  })

  it("should send the browser's time zone with the card request", async () => {
    mockedGetReviewCards.mockResolvedValue(queueResponse([]))

    renderPage()

    await screen.findByTestId('anki-review-done')

    expect(mockedGetReviewCards).toHaveBeenCalledWith({
      data: expect.objectContaining({ tz: Intl.DateTimeFormat().resolvedOptions().timeZone }),
    })
  })

  it('should offer a retry when cards fail to load', async () => {
    mockedGetReviewCards
      .mockResolvedValueOnce({ ok: false, error: 'unknown' })
      .mockResolvedValueOnce(queueResponse([firstCard]))

    renderPage()

    await userEvent.click(await screen.findByTestId('anki-review-retry'))

    expect(await screen.findByText(firstCard.prompt)).toBeTruthy()
  })

  it('should keep the same card revealed with an error when a grade fails to save, and let it be retried', async () => {
    mockedGetReviewCards.mockResolvedValue(queueResponse([firstCard, secondCard]))
    mockedSubmitReview
      .mockResolvedValueOnce({ ok: false, error: 'network_error' })
      .mockResolvedValueOnce(savedGrade)

    renderPage()

    await userEvent.click(await screen.findByTestId('anki-review-show-answer'))
    await userEvent.click(screen.getByTestId('anki-review-grade-good'))

    expect(await screen.findByTestId('anki-review-grade-error')).toBeTruthy()
    expect(screen.getByText(firstCard.answer)).toBeTruthy()

    await userEvent.click(screen.getByTestId('anki-review-grade-good'))

    expect(await screen.findByText(secondCard.prompt)).toBeTruthy()
  })

  it('should not show or accept grades for the graded card while the next batch is loading', async () => {
    let resolveNextBatch: (value: ReturnType<typeof queueResponse>) => void = () => {}

    mockedGetReviewCards
      .mockResolvedValueOnce(queueResponse([firstCard]))
      .mockReturnValueOnce(new Promise((resolve) => (resolveNextBatch = resolve)))
    mockedSubmitReview.mockResolvedValue(savedGrade)

    renderPage()

    await userEvent.click(await screen.findByTestId('anki-review-show-answer'))
    await userEvent.click(screen.getByTestId('anki-review-grade-good'))
    await waitFor(() => expect(mockedGetReviewCards).toHaveBeenCalledTimes(2))

    expect(screen.queryByText(firstCard.prompt)).toBeNull()

    fireEvent.keyDown(window, { key: ' ' })
    fireEvent.keyDown(window, { key: '1' })

    expect(mockedSubmitReview).toHaveBeenCalledTimes(1)

    resolveNextBatch(queueResponse([secondCard]))

    expect(await screen.findByText(secondCard.prompt)).toBeTruthy()
  })

  it('should explain a card that can no longer be graded and let the learner skip it', async () => {
    mockedGetReviewCards.mockResolvedValue(queueResponse([firstCard, secondCard]))
    mockedSubmitReview.mockResolvedValueOnce({ ok: false, error: 'not_approved' })

    renderPage()

    await userEvent.click(await screen.findByTestId('anki-review-show-answer'))
    await userEvent.click(screen.getByTestId('anki-review-grade-good'))

    const error = await screen.findByTestId('anki-review-grade-error')

    expect(error.textContent).not.toContain('not_approved')
    expect(error.textContent).toContain('no longer available')

    await userEvent.click(screen.getByTestId('anki-review-skip'))

    expect(await screen.findByText(secondCard.prompt)).toBeTruthy()
    expect(screen.queryByTestId('anki-review-grade-error')).toBeNull()
  })

  it('should not offer skip for a save error that a retry can fix', async () => {
    mockedGetReviewCards.mockResolvedValue(queueResponse([firstCard]))
    mockedSubmitReview.mockResolvedValueOnce({ ok: false, error: 'network_error' })

    renderPage()

    await userEvent.click(await screen.findByTestId('anki-review-show-answer'))
    await userEvent.click(screen.getByTestId('anki-review-grade-good'))

    expect(await screen.findByTestId('anki-review-grade-error')).toBeTruthy()
    expect(screen.queryByTestId('anki-review-skip')).toBeNull()
  })

  it('should start from the first hidden card of the new scope when the scope changes', async () => {
    searchState.current = { topicId: 'topic-1' }
    mockedGetReviewCards.mockImplementation(async ({ data }) =>
      data.topicId === 'topic-2'
        ? queueResponse([secondCard])
        : queueResponse([firstCard, firstCardSibling]),
    )
    mockedSubmitReview.mockResolvedValue(savedGrade)

    const { rerenderPage } = renderPage()

    await userEvent.click(await screen.findByTestId('anki-review-show-answer'))
    await userEvent.click(screen.getByTestId('anki-review-grade-good'))
    await screen.findByText(firstCardSibling.prompt)
    await userEvent.click(screen.getByTestId('anki-review-show-answer'))

    searchState.current = { topicId: 'topic-2' }
    rerenderPage()

    expect(await screen.findByText(secondCard.prompt)).toBeTruthy()
    expect(screen.queryByText(secondCard.answer)).toBeNull()
    expect(screen.getByTestId('anki-review-show-answer')).toBeTruthy()
  })

  it('should stop the browser from scrolling the page when Space reveals the answer', async () => {
    mockedGetReviewCards.mockResolvedValue(queueResponse([firstCard]))

    renderPage()

    await screen.findByText(firstCard.prompt)

    const notPrevented = fireEvent.keyDown(window, { key: ' ' })

    expect(notPrevented).toBe(false)
  })

  it('should keep the current scope when switching to typed answers and load cards in that scope', async () => {
    searchState.current = { topicId: 'topic-3' }
    mockedGetReviewCards.mockResolvedValue(queueResponse([]))

    renderPage()

    const link = await screen.findByTestId('anki-review-switch-to-typed')

    expect(link.getAttribute('data-to')).toBe('/knowledge/answer')
    expect(JSON.parse(link.getAttribute('data-search') ?? '{}')).toEqual({ topicId: 'topic-3' })
    expect(mockedGetReviewCards).toHaveBeenCalledWith({
      data: expect.objectContaining({ topicId: 'topic-3' }),
    })
  })
})

describe('Sidebar review entries', () => {
  it('should open Anki review from "Review" and keep the typed mode under "Answer (typed)"', () => {
    render(<Sidebar />)

    expect(screen.getByTestId('nav-knowledge-review').getAttribute('data-to')).toBe(
      '/knowledge/review',
    )
    expect(screen.getByTestId('nav-knowledge-answer').getAttribute('data-to')).toBe(
      '/knowledge/answer',
    )
    expect(screen.getByTestId('nav-knowledge-answer').textContent).toContain('Answer (typed)')
  })
})
