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

import { listRejectedKnowledgeBits, restoreRejectedKnowledgeBit } from '../knowledge-bit/rejected-knowledge-bits.api'
import { PENDING_REVIEW_CHANGED_EVENT } from '../knowledge-bit/knowledge-bit-review-events'
import { Route } from './knowledge.rejected'

const mockedList = vi.mocked(listRejectedKnowledgeBits)
const mockedRestore = vi.mocked(restoreRejectedKnowledgeBit)

const route = Route as unknown as { component: () => ReactNode }

const items = ['kb1', 'kb2', 'kb3', 'kb4'].map((id) => ({
  knowledgeBitId: id,
  body: `Card ${id}`,
  reasonCode: 'other' as const,
  decidedAt: '2026-10-03T00:00:00.000Z',
}))

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
  routerState.search = {}
})

describe('rejected cards bulk restore', () => {
  it('should restore every ticked card through the single-card endpoint, at most 3 at a time', async () => {
    mockedList.mockResolvedValue({ ok: true, hasMore: false, items })
    let active = 0
    let peak = 0
    mockedRestore.mockImplementation(async () => {
      active += 1
      peak = Math.max(peak, active)
      await new Promise((resolve) => setTimeout(resolve, 5))
      active -= 1

      return { ok: true }
    })
    const changed = vi.fn()
    window.addEventListener(PENDING_REVIEW_CHANGED_EVENT, changed)

    renderPage()
    await userEvent.click(await screen.findByTestId('rejected-cards-select-all'))
    await userEvent.click(screen.getByTestId('rejected-cards-restore-selected'))

    await waitFor(() => expect(screen.getByTestId('rejected-cards-empty')).toBeTruthy())
    expect(mockedRestore).toHaveBeenCalledTimes(4)
    expect(peak).toBe(3)
    expect(changed).toHaveBeenCalled()
    window.removeEventListener(PENDING_REVIEW_CHANGED_EVENT, changed)
  })

  it('should keep going when one card fails, flag only that card and leave it selected', async () => {
    mockedList.mockResolvedValue({ ok: true, hasMore: false, items })
    mockedRestore.mockImplementation(async ({ data }) =>
      data.bitId === 'kb2' ? { ok: false, reason: 'failed' } : { ok: true },
    )

    renderPage()
    await userEvent.click(await screen.findByTestId('rejected-cards-select-all'))
    await userEvent.click(screen.getByTestId('rejected-cards-restore-selected'))

    expect(await screen.findByTestId('rejected-card-restore-error-kb2')).toBeTruthy()
    expect(mockedRestore).toHaveBeenCalledTimes(4)
    expect(screen.queryByTestId('rejected-card-row-kb1')).toBeNull()
    expect(screen.queryByTestId('rejected-card-row-kb4')).toBeNull()
    expect((screen.getByTestId('rejected-card-select-kb2') as HTMLInputElement).checked).toBe(true)
    expect(screen.getByTestId('rejected-cards-restore-selected').textContent).toBe('Restore selected (1)')
  })

  it('should drop a card from the selection once it leaves the list', async () => {
    mockedList.mockResolvedValue({ ok: true, hasMore: false, items })
    mockedRestore.mockResolvedValue({ ok: true })

    renderPage()
    await userEvent.click(await screen.findByTestId('rejected-card-select-kb1'))
    await userEvent.click(screen.getByTestId('rejected-card-select-kb2'))
    expect(screen.getByTestId('rejected-cards-restore-selected').textContent).toBe('Restore selected (2)')

    await userEvent.click(screen.getByTestId('rejected-card-restore-kb1'))

    await waitFor(() =>
      expect(screen.getByTestId('rejected-cards-restore-selected').textContent).toBe('Restore selected (1)'),
    )
  })

  it('should not offer to restore anything until a card is ticked', async () => {
    mockedList.mockResolvedValue({ ok: true, hasMore: false, items })

    renderPage()

    expect(
      ((await screen.findByTestId('rejected-cards-restore-selected')) as HTMLButtonElement).disabled,
    ).toBe(true)
  })
})
