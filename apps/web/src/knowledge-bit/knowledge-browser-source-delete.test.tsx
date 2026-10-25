// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import type { KnowledgeBitBrowserItem } from '@post-anki/shared'

const deleteSource = vi.hoisted(() => vi.fn())

vi.mock('./knowledge-browser-source.api', () => ({ deleteKnowledgeSourceById: deleteSource }))

import { KnowledgeBrowserActionBar } from './knowledge-browser-action-bar'
import { KnowledgeBrowserSourceBar } from './knowledge-browser-source-bar'
import { idsFromSource, singleSelectedSource } from './knowledge-browser-source'
import { KnowledgeBrowserTable } from './knowledge-browser-table'
import { useKnowledgeBrowserSelectionDelete } from './use-knowledge-browser-selection-delete'
import { useKnowledgeBrowserSourceDelete } from './use-knowledge-browser-source-delete'

const make = (id: string, sourceId: string | null, sourceLabel: string | null): KnowledgeBitBrowserItem => ({
  knowledgeBitId: id,
  phrasings: [{ id: `v-${id}`, kind: 'basic', prompt: `Q ${id}` }],
  answer: `A ${id}`,
  origin: 'article',
  sourceId,
  sourceLabel,
  addedAt: '2026-03-04T12:00:00.000Z',
  sourcePieceCount: sourceId === 's1' ? 8 : 1,
})

const rows = [
  make('b1', 's1', 'blog.example.com'),
  make('b2', 's2', 'Notes'),
  make('b3', 's1', 'blog.example.com'),
  make('b4', null, null),
]

function Harness() {
  const selection = useKnowledgeBrowserSelectionDelete(rows.map((row) => row.knowledgeBitId))
  const source = useKnowledgeBrowserSourceDelete(rows, selection.clear)
  const active = singleSelectedSource(rows, selection.selected)

  return (
    <>
      <KnowledgeBrowserSourceBar state={source} />
      <KnowledgeBrowserActionBar
        state={selection}
        source={
          active
            ? {
                count: source.countFor(active),
                onSelectAll: () => selection.addRows(idsFromSource(rows, active)),
                onDelete: () => source.open(active),
              }
            : null
        }
      />
      <KnowledgeBrowserTable
        rows={rows}
        columnOrder={['phrasings', 'source']}
        onColumnOrderChange={vi.fn()}
        selected={selection.selected}
        onToggleRow={selection.toggleRow}
        onToggleAll={selection.toggleAll}
        sourceActions={{ countFor: source.countFor, onDeleteSource: source.open }}
      />
    </>
  )
}

let client: QueryClient

beforeEach(() => {
  deleteSource.mockReset()
  client = new QueryClient()
  render(
    <QueryClientProvider client={client}>
      <Harness />
    </QueryClientProvider>,
  )
})
afterEach(cleanup)

describe('Knowledge browser delete whole source', () => {
  it('should show which source each piece came from', () => {
    expect(screen.getAllByTestId('knowledge-browser-source-label').map((el) => el.textContent)).toEqual([
      'blog.example.com',
      'Notes',
      'blog.example.com',
    ])
  })

  it('should name the number of pieces from that source and delete nothing before confirming', () => {
    fireEvent.click(screen.getAllByTestId('knowledge-browser-row-delete-source')[0])

    expect(screen.getByRole('alertdialog').textContent).toContain('blog.example.com" and its 8 pieces')
    expect(deleteSource).not.toHaveBeenCalled()
  })

  it('should state the real number of pieces and say that some are hidden by the filters', () => {
    fireEvent.click(screen.getAllByTestId('knowledge-browser-row-delete-source')[0])

    expect(screen.getByTestId('knowledge-browser-source-bar').textContent).toContain(
      '6 of them are hidden by the filters or not loaded yet.',
    )
    expect(screen.getByTestId('knowledge-browser-source-confirm').textContent).toBe('Yes, delete 8 pieces')
  })

  it('should not mention hidden pieces when every piece of the source is shown', () => {
    fireEvent.click(screen.getAllByTestId('knowledge-browser-row-delete-source')[1])

    expect(screen.getByTestId('knowledge-browser-source-bar').textContent).not.toContain('hidden')
  })

  it('should delete the source once confirmed, then clear the selection and refresh the data', async () => {
    deleteSource.mockResolvedValue({ ok: true, counts: {} })
    const invalidate = vi.spyOn(client, 'invalidateQueries')

    fireEvent.click(screen.getAllByTestId('knowledge-browser-row-delete-source')[1])
    fireEvent.click(screen.getByTestId('knowledge-browser-source-confirm'))

    await waitFor(() => expect(screen.queryByTestId('knowledge-browser-source-bar')).toBeNull())

    expect(deleteSource).toHaveBeenCalledWith({ data: { id: 's2' } })
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ['knowledge-bits'] })
  })

  it('should keep everything and show an error when the source delete fails', async () => {
    deleteSource.mockResolvedValue({ ok: false, error: 'boom' })
    const invalidate = vi.spyOn(client, 'invalidateQueries')

    fireEvent.click(screen.getAllByTestId('knowledge-browser-row-delete-source')[0])
    fireEvent.click(screen.getByTestId('knowledge-browser-source-confirm'))

    await screen.findByTestId('knowledge-browser-source-error')

    expect(invalidate).not.toHaveBeenCalled()
  })

  it('should not delete when the confirm is cancelled', () => {
    fireEvent.click(screen.getAllByTestId('knowledge-browser-row-delete-source')[0])
    fireEvent.click(screen.getByTestId('knowledge-browser-source-cancel'))

    expect(screen.queryByTestId('knowledge-browser-source-bar')).toBeNull()
    expect(deleteSource).not.toHaveBeenCalled()
  })

  it('should offer select-all-from-source only when the selection is from one source and select the rest of it', () => {
    const boxes = () => screen.getAllByTestId('knowledge-browser-select-row')

    fireEvent.click(boxes()[0])
    fireEvent.click(screen.getByTestId('knowledge-browser-select-source'))

    expect(screen.getByTestId('knowledge-browser-selected-count').textContent).toBe('2 selected')
    expect(screen.getByTestId('knowledge-browser-delete-source').textContent).toContain('(8 pieces)')

    fireEvent.click(boxes()[1])

    expect(screen.queryByTestId('knowledge-browser-select-source')).toBeNull()
  })

  it('should offer the source action only on pieces that have a source', () => {
    expect(screen.getAllByTestId('knowledge-browser-row-delete-source')).toHaveLength(3)
  })
})
