// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { ReactNode } from 'react'
import type { KnowledgeBitOverviewItem } from '@post-anki/shared'

vi.mock('@tanstack/react-router', () => ({
  createFileRoute: () => (config: { component: () => ReactNode }) => ({
    component: config.component,
  }),
}))

vi.mock('@tanstack/react-db', async () => {
  const { overviewSubjects } = await import('../mocks/knowledge-overview.mock')

  return { useLiveQuery: () => ({ data: overviewSubjects }) }
})

vi.mock('../curriculum/board.collection', () => ({
  subjectsCollection: {},
  mapSubjectRow: (row: unknown) => row,
}))

vi.mock('../knowledge-bit/anki-review.api')
vi.mock('../knowledge-bit/knowledge-overview.api')

import { updateCardSchedule } from '../knowledge-bit/anki-review.api'
import { deleteKnowledgeBits, listKnowledgeOverview } from '../knowledge-bit/knowledge-overview.api'
import { overviewItem } from '../mocks/knowledge-overview.mock'
import { Route } from './knowledge.index'

const mockedList = vi.mocked(listKnowledgeOverview)
const mockedDelete = vi.mocked(deleteKnowledgeBits)
const mockedUpdate = vi.mocked(updateCardSchedule)

const OverviewPage = (Route as unknown as { component: () => ReactNode }).component

function renderPage() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })

  return render(
    <QueryClientProvider client={queryClient}>
      <OverviewPage />
    </QueryClientProvider>,
  )
}

function serve(initial: KnowledgeBitOverviewItem[]) {
  let remaining = [...initial]

  mockedList.mockImplementation(async () => ({ ok: true, items: remaining, hasMore: false }))
  mockedDelete.mockImplementation(async ({ data }) => {
    remaining = remaining.filter((item) => !data.knowledgeBitIds.includes(item.knowledgeBitId))

    return { ok: true, deleted: data.knowledgeBitIds, skipped: [] }
  })
}

function row(index: number) {
  return screen.getByTestId(`knowledge-overview-row-bit-${index}`)
}

async function focusRow(user: ReturnType<typeof userEvent.setup>, index: number) {
  await user.click(within(row(index)).getByText(`Question ${index}?`))
}

const FIVE = [1, 2, 3, 4, 5].map((index) => overviewItem(index))

beforeEach(() => {
  serve(FIVE)
})

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
})

describe('KnowledgeOverviewPage', () => {
  it('should list approved cards with question, answer, subject path and state', async () => {
    renderPage()

    await screen.findByTestId('knowledge-overview-grid')

    expect(within(row(1)).getByText('Question 1?')).toBeTruthy()
    expect(within(row(1)).getByText('Answer 1')).toBeTruthy()
    expect(screen.getByTestId('knowledge-overview-subject-bit-1').textContent).toBe('Computer science › Networking')
    expect(screen.getByTestId('knowledge-overview-state-bit-1').textContent).toContain('Review')
  })

  it('should expose a multiselectable grid with one tab stop', async () => {
    renderPage()

    const grid = await screen.findByRole('grid')

    expect(grid.getAttribute('aria-multiselectable')).toBe('true')
    expect(screen.getAllByRole('row').filter((element) => element.tabIndex === 0)).toHaveLength(1)
  })

  it('should let a keyboard-only user select a range, delete it and confirm with Enter', async () => {
    const user = userEvent.setup()

    renderPage()
    await screen.findByTestId('knowledge-overview-grid')
    await focusRow(user, 1)

    await user.keyboard('{Shift>}{ArrowDown}{ArrowDown}{/Shift}')

    expect(screen.getByTestId('knowledge-overview-selection-bar').textContent).toContain('Selected 3')
    expect(row(3).getAttribute('aria-selected')).toBe('true')
    expect(row(4).getAttribute('aria-selected')).toBe('false')

    await user.keyboard('{Delete}')

    const dialog = screen.getByRole('alertdialog', { name: 'Delete 3 cards permanently?' })

    expect(document.activeElement).toBe(within(dialog).getByRole('button', { name: 'Delete' }))

    await user.keyboard('{Enter}')

    await waitFor(() => expect(screen.queryByTestId('knowledge-overview-row-bit-1')).toBeNull())

    expect(mockedDelete).toHaveBeenCalledWith({ data: { knowledgeBitIds: ['bit-1', 'bit-2', 'bit-3'] } })
    expect(screen.queryByRole('alertdialog')).toBeNull()
    await waitFor(() => expect(document.activeElement).toBe(row(4)))
    expect(screen.getByTestId('knowledge-bit-review-announcer-polite').textContent).toContain('Deleted 3 cards.')
  })

  it('should return focus to the row it came from when delete is cancelled', async () => {
    const user = userEvent.setup()

    renderPage()
    await screen.findByTestId('knowledge-overview-grid')
    await focusRow(user, 2)
    await user.keyboard('{Delete}')
    await user.keyboard('{Escape}')

    expect(screen.queryByRole('alertdialog')).toBeNull()
    await waitFor(() => expect(document.activeElement).toBe(row(2)))
    expect(mockedDelete).not.toHaveBeenCalled()
  })

  it('should delete only the focused row when nothing is selected', async () => {
    const user = userEvent.setup()

    renderPage()
    await screen.findByTestId('knowledge-overview-grid')
    await focusRow(user, 3)
    await user.keyboard('{Backspace}')

    expect(screen.getByRole('alertdialog', { name: 'Delete 1 card permanently?' })).toBeTruthy()

    await user.keyboard('{Enter}')

    await waitFor(() => expect(mockedDelete).toHaveBeenCalledWith({ data: { knowledgeBitIds: ['bit-3'] } }))
  })

  it('should move focus to the previous row when the last rows are deleted', async () => {
    const user = userEvent.setup()

    renderPage()
    await screen.findByTestId('knowledge-overview-grid')
    await focusRow(user, 5)
    await user.keyboard('{Delete}{Enter}')

    await waitFor(() => expect(document.activeElement).toBe(row(4)))
  })

  it('should focus the page heading when every card is deleted', async () => {
    const user = userEvent.setup()

    serve([overviewItem(1)])
    renderPage()
    await screen.findByTestId('knowledge-overview-grid')
    await focusRow(user, 1)
    await user.keyboard('{Delete}{Enter}')

    await waitFor(() => expect(document.activeElement).toBe(screen.getByRole('heading', { level: 1 })))
  })

  it('should keep the cards and announce the failure assertively when delete fails', async () => {
    const user = userEvent.setup()

    mockedDelete.mockResolvedValue({ ok: false, error: 'boom' })
    renderPage()
    await screen.findByTestId('knowledge-overview-grid')
    await focusRow(user, 1)
    await user.keyboard('{Delete}{Enter}')

    await waitFor(() =>
      expect(screen.getByTestId('knowledge-bit-review-announcer-assertive').textContent).toContain('Could not delete'),
    )
    expect(screen.getByRole('alertdialog')).toBeTruthy()
    expect(row(1)).toBeTruthy()
  })

  it('should select every loaded row on Ctrl+A and clear on Escape', async () => {
    const user = userEvent.setup()

    renderPage()
    await screen.findByTestId('knowledge-overview-grid')
    await focusRow(user, 1)
    await user.keyboard('{Control>}a{/Control}')

    expect(screen.getByTestId('knowledge-overview-selection-bar').textContent).toContain('Selected 5')

    await user.keyboard('{Escape}')

    expect(screen.getByTestId('knowledge-overview-selection-bar').textContent).toContain('None selected')
  })

  it('should toggle a row with Space', async () => {
    const user = userEvent.setup()

    renderPage()
    await screen.findByTestId('knowledge-overview-grid')
    await focusRow(user, 2)
    await user.keyboard(' ')

    expect(row(2).getAttribute('aria-selected')).toBe('true')
    expect(screen.getByTestId('knowledge-bit-review-announcer-polite').textContent).toContain('1 selected')
  })

  it('should select a range with Shift+click on checkboxes', async () => {
    const user = userEvent.setup()

    renderPage()
    await screen.findByTestId('knowledge-overview-grid')
    await user.click(screen.getByTestId('knowledge-overview-check-bit-2'))
    await user.keyboard('{Shift>}')
    await user.click(screen.getByTestId('knowledge-overview-check-bit-4'))
    await user.keyboard('{/Shift}')

    expect(screen.getByTestId('knowledge-overview-selection-bar').textContent).toContain('Selected 3')
  })

  it('should not open delete when Backspace is pressed while typing in search', async () => {
    const user = userEvent.setup()

    renderPage()
    await screen.findByTestId('knowledge-overview-grid')
    await focusRow(user, 1)
    await user.keyboard(' ')
    await user.type(screen.getByTestId('knowledge-overview-search'), 'ab{Backspace}')

    expect(screen.queryByRole('alertdialog')).toBeNull()
  })

  it('should delete from the selection bar with the Delete and Clear buttons', async () => {
    const user = userEvent.setup()

    renderPage()
    await screen.findByTestId('knowledge-overview-grid')
    await user.click(screen.getByTestId('knowledge-overview-check-bit-1'))
    await user.click(screen.getByTestId('knowledge-overview-delete'))

    expect(screen.getByRole('alertdialog', { name: 'Delete 1 card permanently?' })).toBeTruthy()

    await user.click(screen.getByTestId('knowledge-overview-delete-cancel'))
    await user.click(screen.getByTestId('knowledge-overview-clear'))

    expect(screen.getByTestId('knowledge-overview-selection-bar').textContent).toContain('None selected')
  })

  it('should filter by the chosen subject and by the search text', async () => {
    const user = userEvent.setup()

    renderPage()
    await screen.findByTestId('knowledge-overview-grid')

    fireEvent.click(screen.getByTestId('knowledge-overview-subject-filter'))
    fireEvent.mouseDown(screen.getByTestId('knowledge-overview-subject-filter-option-subject-cs'))

    await waitFor(() =>
      expect(mockedList).toHaveBeenLastCalledWith({ data: expect.objectContaining({ subjectId: 'subject-cs' }) }),
    )

    await user.type(screen.getByTestId('knowledge-overview-search'), 'tcp')

    await waitFor(() =>
      expect(mockedList).toHaveBeenLastCalledWith({
        data: expect.objectContaining({ subjectId: 'subject-cs', q: 'tcp' }),
      }),
    )
  })

  it('should suspend a card from its row', async () => {
    const user = userEvent.setup()

    mockedUpdate.mockResolvedValue({
      ok: true,
      knowledgeBitId: 'bit-1',
      suspended: true,
      buriedUntil: null,
      leech: false,
    })
    renderPage()
    await screen.findByTestId('knowledge-overview-grid')
    await user.click(screen.getByTestId('knowledge-overview-menu-bit-1'))
    await user.click(screen.getByTestId('knowledge-overview-suspend-bit-1'))

    expect(mockedUpdate).toHaveBeenCalledWith({ data: { knowledgeBitId: 'bit-1', suspended: true } })
  })

  it('should offer Unsuspend for a suspended card', async () => {
    serve([overviewItem(1, { state: 'suspended' })])
    renderPage()

    await userEvent.click(await screen.findByTestId('knowledge-overview-menu-bit-1'))
    const button = await screen.findByTestId('knowledge-overview-suspend-bit-1')

    expect(button.textContent).toBe('Unsuspend')
  })

  it('should say when no cards match', async () => {
    serve([])
    renderPage()

    expect(await screen.findByTestId('knowledge-overview-empty')).toBeTruthy()
  })

  it('should offer Retry and keep the download links when the card list cannot be loaded', async () => {
    mockedList.mockResolvedValueOnce({ ok: false, error: 'unknown' })
    renderPage()

    expect((await screen.findByTestId('knowledge-overview-error')).textContent).toContain(
      'Could not load your cards. Check your connection and try again.',
    )
    expect(screen.getByTestId('knowledge-overview-download-csv')).toBeTruthy()

    serve([overviewItem(1)])
    await userEvent.click(screen.getByTestId('knowledge-overview-retry'))

    expect(await screen.findByTestId('knowledge-overview-menu-bit-1')).toBeTruthy()
    expect(screen.queryByTestId('knowledge-overview-error')).toBeNull()
  })
})
