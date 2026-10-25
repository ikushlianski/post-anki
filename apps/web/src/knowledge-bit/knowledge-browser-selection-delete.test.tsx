// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import type { KnowledgeBitBrowserItem } from '@post-anki/shared'

const purge = vi.hoisted(() => vi.fn())
const openRow = vi.hoisted(() => vi.fn())

vi.mock('./knowledge-browser-purge.api', () => ({ purgeKnowledgeBits: purge }))

import { KnowledgeBrowserActionBar } from './knowledge-browser-action-bar'
import { KnowledgeBrowserTable } from './knowledge-browser-table'
import { useKnowledgeBrowserSelectionDelete } from './use-knowledge-browser-selection-delete'

const rows: KnowledgeBitBrowserItem[] = ['b1', 'b2', 'b3', 'b4'].map((id) => ({
  knowledgeBitId: id,
  phrasings: [{ id: `v-${id}`, kind: 'basic', prompt: `Q ${id}` }],
  answer: `A ${id}`,
  origin: 'manual',
  addedAt: '2026-03-04T12:00:00.000Z',
  sourcePieceCount: 1,
}))

function Harness() {
  const state = useKnowledgeBrowserSelectionDelete(rows.map((row) => row.knowledgeBitId))

  return (
    <>
      <KnowledgeBrowserActionBar state={state} />
      <KnowledgeBrowserTable
        rows={rows}
        columnOrder={['phrasings', 'answer']}
        onColumnOrderChange={vi.fn()}
        selected={state.selected}
        onOpenRow={openRow}
        onToggleRow={state.toggleRow}
        onToggleAll={state.toggleAll}
      />
    </>
  )
}

let client: QueryClient

function renderHarness() {
  client = new QueryClient()
  render(
    <QueryClientProvider client={client}>
      <Harness />
    </QueryClientProvider>,
  )
}

function checkboxes() {
  return screen.getAllByTestId('knowledge-browser-select-row')
}

beforeEach(() => {
  purge.mockReset()
  openRow.mockReset()
})
afterEach(cleanup)

describe('Knowledge browser select and delete', () => {
  it('should show how many pieces are selected and hide the bar when none are', () => {
    renderHarness()

    expect(screen.getByTestId('knowledge-browser-selected-count').textContent).toBe('0 selected')

    fireEvent.click(checkboxes()[0])
    fireEvent.click(checkboxes()[2])

    expect(screen.getByTestId('knowledge-browser-selected-count').textContent).toBe('2 selected')
  })

  it('should select the whole range when a piece is shift-clicked', () => {
    renderHarness()

    fireEvent.click(checkboxes()[0])
    fireEvent.click(checkboxes()[2], { shiftKey: true })

    expect(screen.getByTestId('knowledge-browser-selected-count').textContent).toBe('3 selected')
  })

  it('should leave the selection alone when a row is clicked and extend it with shift-click and command-click', () => {
    renderHarness()
    const rowsEls = screen.getAllByTestId('knowledge-browser-row')

    fireEvent.click(checkboxes()[0])
    fireEvent.click(screen.getByText('A b2'))

    expect(screen.getByTestId('knowledge-browser-selected-count').textContent).toBe('1 selected')

    fireEvent.click(rowsEls[2], { shiftKey: true })

    expect(screen.getByTestId('knowledge-browser-selected-count').textContent).toBe('3 selected')

    fireEvent.click(rowsEls[3], { metaKey: true })

    expect(screen.getByTestId('knowledge-browser-selected-count').textContent).toBe('4 selected')

    fireEvent.click(rowsEls[1], { ctrlKey: true })

    expect(screen.getByTestId('knowledge-browser-selected-count').textContent).toBe('3 selected')
  })

  it('should open the piece instead of selecting it when a row is clicked with nothing selected', () => {
    renderHarness()

    fireEvent.click(screen.getByText('A b1'))

    expect(screen.getByTestId('knowledge-browser-selected-count').textContent).toBe('0 selected')
    expect(openRow).toHaveBeenCalledWith('b1')
  })

  it('should select every piece on the page with the header checkbox and clear with Clear selection', () => {
    renderHarness()

    fireEvent.click(screen.getByTestId('knowledge-browser-select-all'))

    expect(screen.getByTestId('knowledge-browser-selected-count').textContent).toBe('4 selected')

    fireEvent.click(screen.getByTestId('knowledge-browser-clear-selection'))

    expect(screen.getByTestId('knowledge-browser-selected-count').textContent).toBe('0 selected')
  })

  it('should ask for confirmation naming the count and never delete before it is given', () => {
    renderHarness()
    fireEvent.click(checkboxes()[0])
    fireEvent.click(checkboxes()[1])
    fireEvent.click(screen.getByTestId('knowledge-browser-delete'))

    expect(screen.getByRole('alertdialog').textContent).toContain('Delete 2 pieces permanently? This cannot be undone.')
    expect(purge).not.toHaveBeenCalled()
  })

  it('should open the confirm on the Delete key and clear the selection on Escape', () => {
    renderHarness()
    fireEvent.click(checkboxes()[0])
    fireEvent.keyDown(window, { key: 'Delete' })

    expect(screen.getByRole('alertdialog')).toBeTruthy()

    fireEvent.keyDown(window, { key: 'Escape' })

    expect(screen.queryByRole('alertdialog')).toBeNull()
    expect(screen.getByTestId('knowledge-browser-selected-count')).toBeTruthy()

    fireEvent.keyDown(window, { key: 'Escape' })

    expect(screen.getByTestId('knowledge-browser-selected-count').textContent).toBe('0 selected')
  })

  it('should send the selected ids once confirmed, then clear the selection and refresh the data', async () => {
    purge.mockResolvedValue({ ok: true, counts: {} })
    renderHarness()
    const invalidate = vi.spyOn(client, 'invalidateQueries')

    fireEvent.click(checkboxes()[0])
    fireEvent.click(checkboxes()[3])
    fireEvent.click(screen.getByTestId('knowledge-browser-delete'))
    fireEvent.click(screen.getByTestId('knowledge-browser-confirm-delete'))

    await waitFor(() => expect(screen.getByTestId('knowledge-browser-selected-count').textContent).toBe('0 selected'))

    expect(purge).toHaveBeenCalledWith({ data: { ids: ['b1', 'b4'] } })
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ['knowledge-bits'] })
  })

  it('should keep the selection and show an error when the delete fails', async () => {
    purge.mockResolvedValue({ ok: false, error: 'boom' })
    renderHarness()
    const invalidate = vi.spyOn(client, 'invalidateQueries')

    fireEvent.click(checkboxes()[0])
    fireEvent.click(screen.getByTestId('knowledge-browser-delete'))
    fireEvent.click(screen.getByTestId('knowledge-browser-confirm-delete'))

    await screen.findByTestId('knowledge-browser-delete-error')

    expect(screen.getByTestId('knowledge-browser-selected-count').textContent).toBe('1 selected')
    expect(invalidate).not.toHaveBeenCalled()
  })
})
