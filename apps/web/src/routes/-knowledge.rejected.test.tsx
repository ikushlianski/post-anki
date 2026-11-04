// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
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

const route = Route as unknown as {
  component: () => ReactNode
  validateSearch: { parse: (input: unknown) => { reason?: string; q?: string } }
}

function renderPage() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })

  return render(
    <QueryClientProvider client={queryClient}>
      <route.component />
    </QueryClientProvider>,
  )
}

afterEach(() => {
  vi.useRealTimers()
  cleanup()
  vi.clearAllMocks()
  routerState.search = {}
})

describe('rejected cards route', () => {
  it('should drop an unknown reason from the address instead of failing the page', () => {
    expect(route.validateSearch.parse({ reason: 'nonsense' })).toEqual({})
    expect(route.validateSearch.parse({ reason: 'bad_format' })).toEqual({ reason: 'bad_format' })
  })

  it('should list rejected cards with the label of the reason they were rejected for', async () => {
    mockedList.mockResolvedValue({
      ok: true,
      hasMore: false,
      items: [{ knowledgeBitId: 'kb1', body: 'TCP uses a handshake', reasonCode: 'wrong_language', decidedAt: '2026-10-03T00:00:00.000Z' }],
    })

    renderPage()

    expect((await screen.findByTestId('rejected-card-reason-kb1')).textContent).toBe('Wrong language')
    expect(screen.getByTestId('rejected-card-row-kb1').textContent).toContain('TCP uses a handshake')
  })

  it('should ask only for the chosen reason when the address carries one', async () => {
    routerState.search = { reason: 'text_recall_only' }
    mockedList.mockResolvedValue({ ok: true, items: [], hasMore: false })

    renderPage()

    await waitFor(() =>
      expect(mockedList).toHaveBeenCalledWith({ data: { limit: 50, offset: 0, reason: 'text_recall_only' } }),
    )
    expect((await screen.findByTestId('rejected-cards-empty')).textContent).toBe('No rejected cards with this reason')
    expect(screen.getByTestId('rejected-cards-chip-text_recall_only').getAttribute('aria-pressed')).toBe('true')
  })

  it('should show a count next to every reason and the total next to all, keeping them while another reason loads', async () => {
    const counts = { other: 4, unspecified: 2 }

    mockedList.mockResolvedValue({ ok: true, items: [], hasMore: false, reasonCounts: counts })

    renderPage()

    expect((await screen.findByTestId('rejected-cards-count-all')).textContent).toBe(' (6)')
    expect(screen.getByTestId('rejected-cards-count-other').textContent).toBe(' (4)')
    expect(screen.getByTestId('rejected-cards-count-unspecified').textContent).toBe(' (2)')
    expect(screen.getByTestId('rejected-cards-count-bad_format').textContent).toBe(' (0)')
  })

  it('should show no counts when the server does not send them', async () => {
    mockedList.mockResolvedValue({ ok: true, items: [], hasMore: false })

    renderPage()
    await screen.findByTestId('rejected-cards-empty')

    expect(screen.queryByTestId('rejected-cards-count-all')).toBeNull()
    expect(screen.queryByTestId('rejected-cards-count-other')).toBeNull()
  })

  it('should put the clicked reason into the address and clear it for all reasons', async () => {
    routerState.search = { reason: 'other' }
    mockedList.mockResolvedValue({ ok: true, items: [], hasMore: false })

    renderPage()
    await userEvent.click(await screen.findByTestId('rejected-cards-chip-bad_format'))
    await userEvent.click(screen.getByTestId('rejected-cards-chip-all'))

    expect(routerState.navigate).toHaveBeenNthCalledWith(1, { search: { reason: 'bad_format' } })
    expect(routerState.navigate).toHaveBeenNthCalledWith(2, { search: {} })
  })

  it('should keep a subject in the address and drop an empty one', () => {
    expect(route.validateSearch.parse({ subjectId: 'sub-n' })).toEqual({ subjectId: 'sub-n' })
    expect(route.validateSearch.parse({ subjectId: '' })).toEqual({})
  })

  it('should ask for the chosen subject together with reason and text, and say so when nothing matches', async () => {
    routerState.search = { reason: 'other', subjectId: 'sub-n', q: 'tcp' }
    mockedList.mockResolvedValue({ ok: true, items: [], hasMore: false })

    renderPage()

    await waitFor(() =>
      expect(mockedList).toHaveBeenCalledWith({
        data: { limit: 50, offset: 0, reason: 'other', subjectId: 'sub-n', q: 'tcp' },
      }),
    )
    expect((screen.getByTestId('rejected-cards-subject') as HTMLSelectElement).value).toBe('sub-n')
  })

  it('should name the subject when a subject has no rejected cards', async () => {
    routerState.search = { subjectId: 'sub-b' }
    mockedList.mockResolvedValue({ ok: true, items: [], hasMore: false })

    renderPage()

    expect((await screen.findByTestId('rejected-cards-empty')).textContent).toBe('No rejected cards in this subject')
  })

  it('should put the picked subject into the address next to reason and text, and clear it for all subjects', async () => {
    routerState.search = { reason: 'other', q: 'tcp' }
    mockedList.mockResolvedValue({ ok: true, items: [], hasMore: false })

    renderPage()
    await userEvent.selectOptions(await screen.findByTestId('rejected-cards-subject'), 'sub-b')

    expect(routerState.navigate).toHaveBeenLastCalledWith({ search: { reason: 'other', subjectId: 'sub-b', q: 'tcp' } })

    routerState.search = { reason: 'other', subjectId: 'sub-b', q: 'tcp' }
    cleanup()
    renderPage()
    await userEvent.selectOptions(await screen.findByTestId('rejected-cards-subject'), '')

    expect(routerState.navigate).toHaveBeenLastCalledWith({ search: { reason: 'other', q: 'tcp' } })
  })

  it('should keep the subject in the address when the reason changes', async () => {
    routerState.search = { subjectId: 'sub-n' }
    mockedList.mockResolvedValue({ ok: true, items: [], hasMore: false })

    renderPage()
    await userEvent.click(await screen.findByTestId('rejected-cards-chip-other'))

    expect(routerState.navigate).toHaveBeenCalledWith({ search: { reason: 'other', subjectId: 'sub-n' } })
  })

  it('should trim the search text in the address and drop an invalid one', () => {
    expect(route.validateSearch.parse({ q: '  tcp ' })).toEqual({ q: 'tcp' })
    expect(route.validateSearch.parse({ q: 'a'.repeat(201) })).toEqual({})
  })

  it('should ask for the search text together with the reason and name the text when nothing matches', async () => {
    routerState.search = { reason: 'other', q: 'tcp' }
    mockedList.mockResolvedValue({ ok: true, items: [], hasMore: false })

    renderPage()

    await waitFor(() =>
      expect(mockedList).toHaveBeenCalledWith({ data: { limit: 50, offset: 0, reason: 'other', q: 'tcp' } }),
    )
    expect((await screen.findByTestId('rejected-cards-empty')).textContent).toBe('No rejected cards match "tcp"')
    expect((screen.getByTestId('rejected-cards-search') as HTMLInputElement).value).toBe('tcp')
  })

  it('should keep the search text in the address when the reason changes', async () => {
    routerState.search = { q: 'tcp' }
    mockedList.mockResolvedValue({ ok: true, items: [], hasMore: false })

    renderPage()
    await userEvent.click(await screen.findByTestId('rejected-cards-chip-other'))

    expect(routerState.navigate).toHaveBeenCalledWith({ search: { reason: 'other', q: 'tcp' } })
  })

  it('should update the address only after typing pauses for 300ms', async () => {
    vi.useFakeTimers()
    routerState.search = { reason: 'other' }
    mockedList.mockResolvedValue({ ok: true, items: [], hasMore: false })

    renderPage()
    const input = screen.getByTestId('rejected-cards-search')

    fireEvent.change(input, { target: { value: 'tc' } })
    act(() => void vi.advanceTimersByTime(200))
    fireEvent.change(input, { target: { value: ' tcp ' } })
    act(() => void vi.advanceTimersByTime(299))

    expect(routerState.navigate).not.toHaveBeenCalled()

    act(() => void vi.advanceTimersByTime(1))

    expect(routerState.navigate).toHaveBeenCalledTimes(1)
    expect(routerState.navigate).toHaveBeenCalledWith({ search: { reason: 'other', q: 'tcp' }, replace: true })
  })

  it('should say nothing was rejected yet when there are no rejections at all', async () => {
    mockedList.mockResolvedValue({ ok: true, items: [], hasMore: false })

    renderPage()

    expect((await screen.findByTestId('rejected-cards-empty')).textContent).toBe('No rejected cards yet')
  })

  it('should remove a restored card at once and tell the sidebar the pending count changed', async () => {
    mockedList.mockResolvedValue({
      ok: true,
      hasMore: false,
      items: [
        { knowledgeBitId: 'kb1', body: 'One', reasonCode: 'other', decidedAt: '2026-10-03T00:00:00.000Z' },
        { knowledgeBitId: 'kb2', body: 'Two', reasonCode: 'other', decidedAt: '2026-10-02T00:00:00.000Z' },
      ],
    })
    mockedRestore.mockResolvedValue({ ok: true })
    const changed = vi.fn()

    window.addEventListener(PENDING_REVIEW_CHANGED_EVENT, changed)
    renderPage()
    await userEvent.click(await screen.findByTestId('rejected-card-restore-kb1'))

    await waitFor(() => expect(screen.queryByTestId('rejected-card-row-kb1')).toBeNull())
    expect(mockedRestore).toHaveBeenCalledWith({ data: { bitId: 'kb1' } })
    expect(screen.getByTestId('rejected-card-row-kb2')).toBeTruthy()
    await waitFor(() => expect(changed).toHaveBeenCalledTimes(1))
    window.removeEventListener(PENDING_REVIEW_CHANGED_EVENT, changed)
  })

  it('should bring the card back with an error when the restore fails', async () => {
    mockedList.mockResolvedValue({
      ok: true,
      hasMore: false,
      items: [{ knowledgeBitId: 'kb1', body: 'One', reasonCode: 'other', decidedAt: '2026-10-03T00:00:00.000Z' }],
    })
    mockedRestore.mockResolvedValue({ ok: false, reason: 'failed' })
    const changed = vi.fn()

    window.addEventListener(PENDING_REVIEW_CHANGED_EVENT, changed)
    renderPage()
    await userEvent.click(await screen.findByTestId('rejected-card-restore-kb1'))

    expect(await screen.findByTestId('rejected-card-restore-error-kb1')).toBeTruthy()
    expect(screen.getByTestId('rejected-card-row-kb1')).toBeTruthy()
    expect(changed).not.toHaveBeenCalled()
    window.removeEventListener(PENDING_REVIEW_CHANGED_EVENT, changed)
  })

  it('should refresh the list with a neutral notice and not announce a change when the card is no longer rejected', async () => {
    mockedList
      .mockResolvedValueOnce({
        ok: true,
        hasMore: false,
        items: [{ knowledgeBitId: 'kb1', body: 'One', reasonCode: 'other', decidedAt: '2026-10-03T00:00:00.000Z' }],
      })
      .mockResolvedValue({ ok: true, hasMore: false, items: [] })
    mockedRestore.mockResolvedValue({ ok: false, reason: 'not_rejected' })
    const changed = vi.fn()

    window.addEventListener(PENDING_REVIEW_CHANGED_EVENT, changed)
    renderPage()
    await userEvent.click(await screen.findByTestId('rejected-card-restore-kb1'))

    expect(await screen.findByTestId('rejected-cards-stale-notice')).toBeTruthy()
    await waitFor(() => expect(mockedList).toHaveBeenCalledTimes(2))
    expect(screen.queryByTestId('rejected-card-row-kb1')).toBeNull()
    expect(changed).not.toHaveBeenCalled()
    window.removeEventListener(PENDING_REVIEW_CHANGED_EVENT, changed)
  })

  it('should treat a missing card as gone without showing an error', async () => {
    mockedList.mockResolvedValue({
      ok: true,
      hasMore: false,
      items: [{ knowledgeBitId: 'kb1', body: 'One', reasonCode: 'other', decidedAt: '2026-10-03T00:00:00.000Z' }],
    })
    mockedRestore.mockResolvedValue({ ok: false, reason: 'not_found' })

    renderPage()
    await userEvent.click(await screen.findByTestId('rejected-card-restore-kb1'))

    await waitFor(() => expect(screen.queryByTestId('rejected-card-row-kb1')).toBeNull())
    expect(screen.queryByTestId('rejected-card-restore-error-kb1')).toBeNull()
  })

  it('should show the source note title as a link when the note has a URL and as plain text otherwise', async () => {
    const base = { body: 'x', reasonCode: 'other' as const, decidedAt: '2026-10-03T00:00:00.000Z' }

    mockedList.mockResolvedValue({
      ok: true,
      hasMore: false,
      items: [
        { ...base, knowledgeBitId: 'kb1', sourceTitle: 'TCP article', sourceUrl: 'https://example.com/tcp' },
        { ...base, knowledgeBitId: 'kb2', sourceTitle: 'My pasted note', sourceUrl: null },
        { ...base, knowledgeBitId: 'kb3', sourceTitle: null, sourceUrl: null },
        { ...base, knowledgeBitId: 'kb4', sourceTitle: 'Evil note', sourceUrl: 'javascript:alert(1)' },
      ],
    })

    renderPage()

    const linked = await screen.findByTestId('rejected-card-source-kb1')

    expect(linked.querySelector('a')?.getAttribute('href')).toBe('https://example.com/tcp')
    expect(screen.getByTestId('rejected-card-source-kb2').querySelector('a')).toBeNull()
    expect(screen.getByTestId('rejected-card-source-kb2').textContent).toBe('My pasted note')
    expect(screen.queryByTestId('rejected-card-source-kb3')).toBeNull()
    expect(screen.getByTestId('rejected-card-source-kb4').querySelector('a')).toBeNull()
    expect(screen.getByTestId('rejected-card-source-kb4').textContent).toBe('Evil note')
  })
})
