// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { cleanup, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { ReactNode } from 'react'
import type { SuspendedCard } from '@post-anki/shared'

vi.mock('@tanstack/react-router', () => ({
  createFileRoute: () => (config: { component: () => ReactNode }) => ({
    component: config.component,
  }),
}))

vi.mock('../knowledge-bit/anki-review.api')
vi.mock('../knowledge-bit/suspended-knowledge-bits.api')

import { updateCardSchedule } from '../knowledge-bit/anki-review.api'
import { listSuspendedKnowledgeBits } from '../knowledge-bit/suspended-knowledge-bits.api'
import { leechCard, buriedCard, suspendedByHandCard } from '../mocks/suspended-cards.mock'
import { Route } from './knowledge.suspended'

const mockedList = vi.mocked(listSuspendedKnowledgeBits)
const mockedUpdate = vi.mocked(updateCardSchedule)

const SuspendedPage = (Route as unknown as { component: () => ReactNode }).component

function renderPage() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })

  return render(
    <QueryClientProvider client={queryClient}>
      <SuspendedPage />
    </QueryClientProvider>,
  )
}

function serveCards(initial: SuspendedCard[]) {
  let remaining = [...initial]

  mockedList.mockImplementation(async () => ({ ok: true, items: remaining, hasMore: false }))
  mockedUpdate.mockImplementation(async ({ data }) => {
    remaining = remaining.filter((card) => card.knowledgeBitId !== data.knowledgeBitId)

    return {
      ok: true,
      knowledgeBitId: data.knowledgeBitId,
      suspended: false,
      buriedUntil: null,
      leech: false,
    }
  })
}

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
})

describe('SuspendedCardsPage', () => {
  it('should show the item text, question and answer as separate fields with a badge for each reason', async () => {
    serveCards([suspendedByHandCard, leechCard, buriedCard])

    renderPage()

    const row = await screen.findByTestId(`suspended-card-row-${leechCard.knowledgeBitId}`)

    expect(within(row).getByTestId(`suspended-card-item-${leechCard.knowledgeBitId}`).textContent).toBe(
      leechCard.itemText,
    )
    expect(within(row).getByTestId(`suspended-card-question-${leechCard.knowledgeBitId}`).textContent).toBe(
      leechCard.question,
    )
    expect(within(row).getByTestId(`suspended-card-answer-${leechCard.knowledgeBitId}`).textContent).toBe(
      leechCard.answer,
    )
    expect(screen.getByTestId(`suspended-card-badge-${suspendedByHandCard.knowledgeBitId}`).textContent).toBe(
      'Suspended',
    )
    expect(screen.getByTestId(`suspended-card-badge-${leechCard.knowledgeBitId}`).textContent).toBe(
      'Leech ×9',
    )
    expect(screen.getByTestId(`suspended-card-badge-${buriedCard.knowledgeBitId}`).textContent).toMatch(
      /^Buried until /,
    )
  })

  it('should show the empty state when nothing is suspended or buried', async () => {
    serveCards([])

    renderPage()

    expect((await screen.findByTestId('suspended-cards-empty')).textContent).toContain(
      'Nothing is suspended or buried',
    )
  })

  it('should take a suspended card out of the list once it is unsuspended', async () => {
    serveCards([suspendedByHandCard, leechCard])

    renderPage()

    const row = await screen.findByTestId(`suspended-card-row-${leechCard.knowledgeBitId}`)
    const user = userEvent.setup()

    await user.click(within(row).getByTestId(`suspended-card-action-${leechCard.knowledgeBitId}`))

    expect(mockedUpdate).toHaveBeenCalledWith({
      data: { knowledgeBitId: leechCard.knowledgeBitId, suspended: false },
    })
    await waitFor(() =>
      expect(screen.queryByTestId(`suspended-card-row-${leechCard.knowledgeBitId}`)).toBeNull(),
    )
    expect(screen.getByTestId(`suspended-card-row-${suspendedByHandCard.knowledgeBitId}`)).toBeTruthy()
  })

  it('should bring a buried card back by clearing only its bury', async () => {
    serveCards([buriedCard])

    renderPage()

    const user = userEvent.setup()

    await user.click(await screen.findByTestId(`suspended-card-action-${buriedCard.knowledgeBitId}`))

    expect(mockedUpdate).toHaveBeenCalledWith({
      data: { knowledgeBitId: buriedCard.knowledgeBitId, buried: false },
    })
    await waitFor(() => expect(screen.getByTestId('suspended-cards-empty')).toBeTruthy())
  })

  it('should disable the button and say it is working while the change is saving', async () => {
    serveCards([suspendedByHandCard])
    mockedUpdate.mockImplementation(() => new Promise(() => {}))

    renderPage()

    const user = userEvent.setup()
    const button = (await screen.findByTestId(
      `suspended-card-action-${suspendedByHandCard.knowledgeBitId}`,
    )) as HTMLButtonElement

    await user.click(button)

    expect(button.disabled).toBe(true)
    expect(button.textContent).toBe('Working…')
  })

  it('should keep the card in the list with an error when the change is refused', async () => {
    serveCards([leechCard])
    mockedUpdate.mockResolvedValue({ ok: false, error: 'not_approved' })

    renderPage()

    const user = userEvent.setup()

    await user.click(await screen.findByTestId(`suspended-card-action-${leechCard.knowledgeBitId}`))

    expect((await screen.findByTestId(`suspended-card-error-${leechCard.knowledgeBitId}`)).textContent).toContain(
      'Could not update this card',
    )
    expect(screen.getByTestId(`suspended-card-row-${leechCard.knowledgeBitId}`)).toBeTruthy()
  })

  it('should offer Retry when the list cannot be loaded and show the cards once the retry succeeds', async () => {
    mockedList.mockResolvedValueOnce({ ok: false, error: 'unknown' })

    renderPage()

    expect((await screen.findByTestId('suspended-cards-error')).textContent).toContain(
      'Could not load your cards. Check your connection and try again.',
    )

    serveCards([leechCard])
    await userEvent.click(screen.getByTestId('suspended-cards-retry'))

    expect(await screen.findByTestId(`suspended-card-row-${leechCard.knowledgeBitId}`)).toBeTruthy()
    expect(screen.queryByTestId('suspended-cards-error')).toBeNull()
  })
})
