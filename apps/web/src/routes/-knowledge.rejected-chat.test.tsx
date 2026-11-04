// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { cleanup, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { ReactNode } from 'react'

const routerState = vi.hoisted(() => ({
  search: {} as { reason?: string; subjectId?: string; q?: string },
  navigate: vi.fn(),
}))

vi.mock('@tanstack/react-router', () => ({
  createFileRoute: () => (config: Record<string, unknown>) => ({
    ...config,
    useSearch: () => routerState.search,
    useNavigate: () => routerState.navigate,
  }),
}))

vi.mock('@tanstack/react-db', () => ({
  useLiveQuery: () => ({
    data: [
      { id: 'sub-b', name: 'Biology', parentId: null },
      { id: 'sub-n', name: 'Networking', parentId: null },
    ],
  }),
}))

vi.mock('../curriculum/board.collection', () => ({
  subjectsCollection: {},
  mapSubjectRow: (row: unknown) => row,
}))

vi.mock('../knowledge-bit/rejected-knowledge-bits.api')
vi.mock('../card-triage/triage-send-to-chat', () => ({ sendRejectedDecisionToChat: vi.fn() }))

import { listRejectedKnowledgeBits } from '../knowledge-bit/rejected-knowledge-bits.api'
import { sendRejectedDecisionToChat } from '../card-triage/triage-send-to-chat'
import { PENDING_REVIEW_CHANGED_EVENT } from '../knowledge-bit/knowledge-bit-review-events'
import { Route } from './knowledge.rejected'

const mockedList = vi.mocked(listRejectedKnowledgeBits)
const mockedSend = vi.mocked(sendRejectedDecisionToChat)

const route = Route as unknown as { component: () => ReactNode }

const items = [
  { knowledgeBitId: 'kb1', body: 'Card kb1', reasonCode: 'other' as const, decidedAt: '2026-10-03T00:00:00.000Z' },
  { knowledgeBitId: 'kb2', body: 'Card kb2', reasonCode: 'bad_format' as const, decidedAt: '2026-10-03T00:00:00.000Z' },
]

function renderPage() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })

  return render(
    <QueryClientProvider client={queryClient}>
      <route.component />
    </QueryClientProvider>,
  )
}

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
})

describe('rejected cards send to Chat', () => {
  it('should drop the row, lower its reason count and refresh the Chat badge when the card is sent to Chat', async () => {
    mockedList.mockResolvedValue({ ok: true, hasMore: false, items, reasonCounts: { other: 1, bad_format: 1 } })
    mockedSend.mockResolvedValue(true)

    const changed = vi.fn()

    window.addEventListener(PENDING_REVIEW_CHANGED_EVENT, changed)
    renderPage()
    await userEvent.click(await screen.findByTestId('rejected-card-send-chat-kb1'))

    await waitFor(() => expect(screen.queryByTestId('rejected-card-row-kb1')).toBeNull())
    expect(mockedSend).toHaveBeenCalledWith('kb1')
    expect(screen.getByTestId('rejected-card-row-kb2')).toBeTruthy()
    expect(screen.getByTestId('rejected-cards-count-other').textContent).toBe(' (0)')
    expect(screen.getByTestId('rejected-cards-count-bad_format').textContent).toBe(' (1)')
    expect(screen.getByTestId('rejected-cards-count-all').textContent).toBe(' (1)')
    expect(changed).toHaveBeenCalledTimes(1)
    window.removeEventListener(PENDING_REVIEW_CHANGED_EVENT, changed)
  })

  it('should keep the row and its count and show an inline error when sending to Chat fails', async () => {
    mockedList.mockResolvedValue({ ok: true, hasMore: false, items, reasonCounts: { other: 1, bad_format: 1 } })
    mockedSend.mockResolvedValue(false)

    const changed = vi.fn()

    window.addEventListener(PENDING_REVIEW_CHANGED_EVENT, changed)
    renderPage()
    await userEvent.click(await screen.findByTestId('rejected-card-send-chat-kb1'))

    expect((await screen.findByTestId('rejected-card-chat-error-kb1')).textContent).toContain('Could not send')
    expect(screen.getByTestId('rejected-card-row-kb1')).toBeTruthy()
    expect(screen.getByTestId('rejected-cards-count-other').textContent).toBe(' (1)')
    expect(changed).not.toHaveBeenCalled()
    window.removeEventListener(PENDING_REVIEW_CHANGED_EVENT, changed)
  })
})
