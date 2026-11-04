// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { cleanup, render, screen } from '@testing-library/react'
import type { KnowledgeBitFeedbackReason } from '@post-anki/shared'

vi.mock('@tanstack/react-db', () => ({ useLiveQuery: () => ({ data: [] }) }))

vi.mock('../curriculum/board.collection', () => ({
  subjectsCollection: {},
  mapSubjectRow: (row: unknown) => row,
}))

vi.mock('./rejected-knowledge-bits.api')

import { listRejectedKnowledgeBits } from './rejected-knowledge-bits.api'
import { RejectedCardsScreen } from './rejected-cards-screen'

const mockedList = vi.mocked(listRejectedKnowledgeBits)

function card(id: string) {
  return { knowledgeBitId: id, body: `Body ${id}`, reasonCode: 'other' as const, decidedAt: '2026-10-03T00:00:00.000Z' }
}

function renderScreen(props: { reason?: KnowledgeBitFeedbackReason; q?: string } = {}) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })

  return render(
    <QueryClientProvider client={queryClient}>
      <RejectedCardsScreen
        reason={props.reason}
        q={props.q}
        onReasonChange={vi.fn()}
        onSubjectChange={vi.fn()}
        onQueryChange={vi.fn()}
      />
    </QueryClientProvider>,
  )
}

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
})

describe('RejectedCardsScreen accessibility and match count', () => {
  it('should announce the loading text politely', () => {
    mockedList.mockReturnValue(new Promise(() => undefined))

    renderScreen()

    const loading = screen.getByTestId('rejected-cards-loading')

    expect(loading.getAttribute('role')).toBe('status')
    expect(loading.getAttribute('aria-live')).toBe('polite')
  })

  it('should hide the match count while loading', () => {
    mockedList.mockReturnValue(new Promise(() => undefined))

    renderScreen()

    expect(screen.getByTestId('rejected-cards-match-count').textContent).toBe('')
  })

  it('should say the whole list is shown once there are no more pages', async () => {
    mockedList.mockResolvedValue({ ok: true, items: [card('a')], hasMore: false })

    renderScreen({ q: 'a' })

    expect((await screen.findByTestId('rejected-cards-end')).textContent).toBe("That's all the rejected cards")
  })

  it('should not say the list is complete while more pages remain or when nothing matches', async () => {
    mockedList.mockResolvedValue({ ok: true, items: [card('a')], hasMore: true })

    const view = renderScreen()

    await screen.findByTestId('rejected-cards-load-more')
    expect(screen.queryByTestId('rejected-cards-end')).toBeNull()

    view.unmount()
    mockedList.mockResolvedValue({ ok: true, items: [], hasMore: false })
    renderScreen()
    await screen.findByTestId('rejected-cards-empty')

    expect(screen.queryByTestId('rejected-cards-end')).toBeNull()
  })

  it('should announce the empty message politely', async () => {
    mockedList.mockResolvedValue({ ok: true, items: [], hasMore: false })

    renderScreen()

    expect((await screen.findByTestId('rejected-cards-empty')).getAttribute('role')).toBe('status')
  })

  it('should keep the load failure as an alert', async () => {
    mockedList.mockResolvedValue({ ok: false, error: 'boom' })

    renderScreen()

    expect((await screen.findByTestId('rejected-cards-error')).getAttribute('role')).toBe('alert')
  })

  it('should say how many cards match with a plural label', async () => {
    mockedList.mockResolvedValue({ ok: true, items: [card('a'), card('b')], hasMore: false })

    renderScreen()

    expect(await screen.findByText('2 rejected cards')).not.toBeNull()
    expect(screen.getByTestId('rejected-cards-match-count').getAttribute('aria-live')).toBe('polite')
  })

  it('should show the reject note under the reason only for cards that have one', async () => {
    mockedList.mockResolvedValue({
      ok: true,
      items: [{ ...card('a'), note: 'Answer was wrong' }, { ...card('b'), note: null }],
      hasMore: false,
    })

    renderScreen()

    expect((await screen.findByTestId('rejected-card-note-a')).textContent).toBe('Answer was wrong')
    expect(screen.queryByTestId('rejected-card-note-b')).toBeNull()
  })

  it('should use the singular label for one card', async () => {
    mockedList.mockResolvedValue({ ok: true, items: [card('a')], hasMore: false })

    renderScreen()

    expect(await screen.findByText('1 rejected card')).not.toBeNull()
  })

  it('should use the server count for the chosen reason when more pages exist', async () => {
    mockedList.mockResolvedValue({
      ok: true,
      items: [card('a')],
      hasMore: true,
      reasonCounts: { other: 12, bad_format: 3 },
    })

    renderScreen({ reason: 'other' })

    expect(await screen.findByText('12 rejected cards')).not.toBeNull()
  })

  it('should show zero when a search matches nothing', async () => {
    mockedList.mockResolvedValue({ ok: true, items: [], hasMore: false })

    renderScreen({ q: 'zzz' })

    expect(await screen.findByText('0 rejected cards')).not.toBeNull()
  })
})
