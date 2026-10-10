// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
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

import {
  editReviewCard,
  getReviewCards,
  submitReview,
  undoReview,
  updateCardSchedule,
} from '../knowledge-bit/anki-review.api'
import { Route } from './knowledge.review'

const mockedGetReviewCards = vi.mocked(getReviewCards)
const mockedSubmitReview = vi.mocked(submitReview)
const mockedUndoReview = vi.mocked(undoReview)
const mockedUpdateSchedule = vi.mocked(updateCardSchedule)
const mockedEditCard = vi.mocked(editReviewCard)

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

async function gradeFirstCard(grade = 'good') {
  await userEvent.click(await screen.findByTestId('anki-review-show-answer'))
  await userEvent.click(screen.getByTestId(`anki-review-grade-${grade}`))
}

describe('Anki review session controls', () => {
  it('should take the last grade back and show the same card again, question side up', async () => {
    mockedGetReviewCards.mockResolvedValue(queueResponse([firstCard, secondCard]))
    mockedSubmitReview.mockResolvedValue(savedGrade)
    mockedUndoReview.mockResolvedValue({ ok: true, knowledgeBitId: 'bit-1' })

    renderPage()
    await gradeFirstCard()
    await screen.findByText(secondCard.prompt)
    await userEvent.click(screen.getByTestId('anki-review-undo'))

    expect(await screen.findByText(firstCard.prompt)).toBeTruthy()
    expect(screen.queryByText(firstCard.answer)).toBeNull()
    expect(mockedUndoReview).toHaveBeenCalledWith({ data: { reviewId: 'review-1' } })
    expect((screen.getByTestId('anki-review-undo') as HTMLButtonElement).disabled).toBe(true)
  })

  it('should undo with the Z key', async () => {
    mockedGetReviewCards.mockResolvedValue(queueResponse([firstCard, secondCard]))
    mockedSubmitReview.mockResolvedValue(savedGrade)
    mockedUndoReview.mockResolvedValue({ ok: true, knowledgeBitId: 'bit-1' })

    renderPage()
    await gradeFirstCard()
    await screen.findByText(secondCard.prompt)
    fireEvent.keyDown(window, { key: 'z' })

    expect(await screen.findByText(firstCard.prompt)).toBeTruthy()
  })

  it('should tell the learner when a grade can no longer be undone and drop only that entry', async () => {
    mockedGetReviewCards.mockResolvedValue(queueResponse([firstCard, secondCard]))
    mockedSubmitReview.mockResolvedValue(savedGrade)
    mockedUndoReview.mockResolvedValue({ ok: false, error: 'not_latest' })

    renderPage()
    await gradeFirstCard()
    await screen.findByText(secondCard.prompt)
    await userEvent.click(screen.getByTestId('anki-review-undo'))

    expect((await screen.findByTestId('anki-review-notice')).textContent).toContain("can't be undone")
    expect(screen.getByText(secondCard.prompt)).toBeTruthy()
    expect((screen.getByTestId('anki-review-undo') as HTMLButtonElement).disabled).toBe(true)
  })

  it('should show progress that grows with each action and shrinks on undo', async () => {
    mockedGetReviewCards.mockResolvedValue(
      queueResponse([firstCard, secondCard], { counts: { new: 1, learning: 0, review: 1 } }),
    )
    mockedSubmitReview.mockResolvedValue(savedGrade)
    mockedUndoReview.mockResolvedValue({ ok: true, knowledgeBitId: 'bit-1' })

    renderPage()
    await screen.findByText(firstCard.prompt)
    await gradeFirstCard()
    await screen.findByText(secondCard.prompt)

    expect(screen.getByTestId('anki-review-progress').textContent).toBe('1 done · 1 left')

    await userEvent.click(screen.getByTestId('anki-review-undo'))
    await screen.findByText(firstCard.prompt)

    expect(screen.getByTestId('anki-review-progress').textContent).toBe('0 done · 2 left')
  })

  it('should not show a progress line before the first card loads', async () => {
    mockedGetReviewCards.mockReturnValue(new Promise(() => {}))

    renderPage()

    expect(screen.queryByTestId('anki-review-session-bar')).toBeNull()
  })

  it('should summarise the session when the learner ends it and let them keep reviewing', async () => {
    mockedGetReviewCards.mockResolvedValue(queueResponse([firstCard, secondCard]))
    mockedSubmitReview.mockResolvedValue(savedGrade)

    renderPage()
    await gradeFirstCard('again')
    await screen.findByText(secondCard.prompt)
    await userEvent.click(screen.getByTestId('anki-review-end-session'))

    expect(screen.getByTestId('anki-review-summary-cards-reviewed').textContent).toBe('1')
    expect(screen.getByTestId('anki-review-summary-again').textContent).toBe('1')
    expect(screen.getByTestId('anki-review-summary-recalled').textContent).toBe('0%')

    await userEvent.click(screen.getByTestId('anki-review-keep-reviewing'))

    expect(screen.getByText(secondCard.prompt)).toBeTruthy()
  })

  it('should show no summary on the done screen when nothing was done', async () => {
    mockedGetReviewCards.mockResolvedValue(queueResponse([]))

    renderPage()

    await screen.findByTestId('anki-review-done')

    expect(screen.queryByTestId('anki-review-summary')).toBeNull()
  })

  it('should edit the revealed card, keep it on screen with the new text and grade the new version', async () => {
    mockedGetReviewCards.mockResolvedValue(queueResponse([firstCard, secondCard]))
    mockedEditCard.mockResolvedValue({ ok: true, variantId: 'variant-1b' })
    mockedSubmitReview.mockResolvedValue(savedGrade)

    renderPage()
    await userEvent.click(await screen.findByTestId('anki-review-show-answer'))
    await userEvent.click(screen.getByTestId('anki-review-edit'))
    await userEvent.clear(screen.getByTestId('anki-review-editor-prompt'))
    await userEvent.type(screen.getByTestId('anki-review-editor-prompt'), 'Better question?')
    await userEvent.click(screen.getByTestId('anki-review-editor-save'))

    expect(await screen.findByText('Better question?')).toBeTruthy()
    expect(screen.getByText(firstCard.answer)).toBeTruthy()

    await userEvent.click(screen.getByTestId('anki-review-grade-good'))

    expect(mockedSubmitReview).toHaveBeenCalledWith({
      data: expect.objectContaining({ variantId: 'variant-1b' }),
    })
  })

  it('should keep the typed text and explain when the edited card changed elsewhere', async () => {
    mockedGetReviewCards.mockResolvedValue(queueResponse([firstCard]))
    mockedEditCard.mockResolvedValue({ ok: false, error: 'not_found' })

    renderPage()
    await userEvent.click(await screen.findByTestId('anki-review-show-answer'))
    await userEvent.click(screen.getByTestId('anki-review-edit'))
    await userEvent.type(screen.getByTestId('anki-review-editor-prompt'), ' more')
    await userEvent.click(screen.getByTestId('anki-review-editor-save'))

    expect((await screen.findByTestId('anki-review-editor-error')).textContent).toContain('elsewhere')
    expect((screen.getByTestId('anki-review-editor-prompt') as HTMLTextAreaElement).value).toContain('more')
  })

  it('should ignore review shortcuts while the editor is open and close it on Escape', async () => {
    mockedGetReviewCards.mockResolvedValue(queueResponse([firstCard]))

    renderPage()
    await userEvent.click(await screen.findByTestId('anki-review-show-answer'))
    fireEvent.keyDown(window, { key: 'e' })

    expect(screen.getByTestId('anki-review-editor')).toBeTruthy()

    fireEvent.keyDown(window, { key: '1' })
    expect(mockedSubmitReview).not.toHaveBeenCalled()

    fireEvent.keyDown(screen.getByTestId('anki-review-editor-prompt'), { key: 'Escape' })

    expect(screen.queryByTestId('anki-review-editor')).toBeNull()
  })

  it('should suspend a card, move on, and bring it back when the suspend is undone', async () => {
    mockedGetReviewCards.mockResolvedValue(queueResponse([firstCard, secondCard]))
    mockedUpdateSchedule.mockResolvedValue({
      ok: true,
      knowledgeBitId: 'bit-1',
      suspended: true,
      buriedUntil: null,
      leech: false,
    })

    renderPage()
    await userEvent.click(await screen.findByTestId('anki-review-suspend'))

    expect(await screen.findByText(secondCard.prompt)).toBeTruthy()
    expect(mockedUpdateSchedule).toHaveBeenCalledWith({
      data: expect.objectContaining({ knowledgeBitId: 'bit-1', suspended: true }),
    })

    await userEvent.click(screen.getByTestId('anki-review-undo'))

    expect(await screen.findByText(firstCard.prompt)).toBeTruthy()
    expect(mockedUpdateSchedule).toHaveBeenLastCalledWith({
      data: expect.objectContaining({ knowledgeBitId: 'bit-1', suspended: false }),
    })
  })

  it('should bury a card from the keyboard', async () => {
    mockedGetReviewCards.mockResolvedValue(queueResponse([firstCard, secondCard]))
    mockedUpdateSchedule.mockResolvedValue({
      ok: true,
      knowledgeBitId: 'bit-1',
      suspended: false,
      buriedUntil: '2026-10-11T00:00:00.000Z',
      leech: false,
    })

    renderPage()
    await screen.findByText(firstCard.prompt)
    fireEvent.keyDown(window, { key: '-' })

    expect(await screen.findByText(secondCard.prompt)).toBeTruthy()
    expect(mockedUpdateSchedule).toHaveBeenCalledWith({
      data: expect.objectContaining({ buried: true }),
    })
  })

  it('should tell the learner a failed card was suspended as a leech and count it in the summary', async () => {
    mockedGetReviewCards.mockResolvedValue(queueResponse([firstCard, secondCard]))
    mockedSubmitReview.mockResolvedValue({ ...savedGrade, leech: true, suspended: true })

    renderPage()
    await gradeFirstCard('again')

    expect((await screen.findByTestId('anki-review-notice')).textContent).toContain('leech')

    await userEvent.click(screen.getByTestId('anki-review-end-session'))

    expect(screen.getByTestId('anki-review-summary-leeches-flagged').textContent).toBe('1')
  })

  it('should mark an unsuspended leech card with a Leech marker', async () => {
    mockedGetReviewCards.mockResolvedValue(queueResponse([{ ...firstCard, leech: true }]))

    renderPage()

    expect(await screen.findByTestId('anki-review-leech')).toBeTruthy()
  })
})
