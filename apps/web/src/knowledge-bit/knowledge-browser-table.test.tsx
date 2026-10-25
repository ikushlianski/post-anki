// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import type { KnowledgeBitBrowserItem } from '@post-anki/shared'

import { KnowledgeBrowserTable } from './knowledge-browser-table'
import type { BrowserColumnId } from './knowledge-browser-columns'

afterEach(cleanup)

const item: KnowledgeBitBrowserItem = {
  knowledgeBitId: 'b1',
  phrasings: [
    { id: 'v1', kind: 'basic', prompt: 'What is a pod?' },
    { id: 'v2', kind: 'fill_in_the_blank', prompt: 'A ___ runs containers' },
  ],
  answer: 'The smallest deployable unit',
  origin: 'manual',
  addedAt: '2026-03-04T12:00:00.000Z',
  sourcePieceCount: 1,
}

const defaultOrder: BrowserColumnId[] = ['phrasings', 'answer', 'source', 'sourceUrl', 'addedBy', 'addedAt']

const selectionProps = { selected: new Set<string>(), onToggleRow: vi.fn(), onToggleAll: vi.fn() }

describe('KnowledgeBrowserTable', () => {
  it('should show every phrasing of a piece, who added it and its answer', () => {
    render(<KnowledgeBrowserTable rows={[item]} columnOrder={defaultOrder} onColumnOrderChange={vi.fn()} {...selectionProps} />)

    const row = screen.getByTestId('knowledge-browser-row')

    expect(within(row).getByText('What is a pod?')).toBeTruthy()
    expect(within(row).getByText('A ___ runs containers')).toBeTruthy()
    expect(within(row).getByText('Typed in')).toBeTruthy()
    expect(within(row).getByText('You')).toBeTruthy()
    expect(within(row).getByText('The smallest deployable unit')).toBeTruthy()
  })

  it('should lay the columns out in the saved order', () => {
    render(
      <KnowledgeBrowserTable
        rows={[item]}
        columnOrder={['answer', 'addedAt', 'addedBy', 'source', 'sourceUrl', 'phrasings']}
        onColumnOrderChange={vi.fn()}
        {...selectionProps}
      />,
    )

    const headers = screen.getAllByRole('columnheader').map((header) => header.textContent)

    expect(headers[1]).toContain('Answer')
    expect(headers[6]).toContain('Question')
  })

  it('should give each column a labelled grip to move it', () => {
    render(<KnowledgeBrowserTable rows={[item]} columnOrder={defaultOrder} onColumnOrderChange={vi.fn()} {...selectionProps} />)

    expect(screen.getByRole('button', { name: 'Move column Answer' })).toBeTruthy()
  })
})

describe('KnowledgeBrowserTable column filters and visibility', () => {
  it('should show only the columns it is given', () => {
    render(<KnowledgeBrowserTable rows={[item]} columnOrder={['phrasings', 'answer']} onColumnOrderChange={vi.fn()} {...selectionProps} />)

    expect(screen.getAllByRole('columnheader')).toHaveLength(3)
    expect(screen.queryByText('Typed in')).toBeNull()
  })

  it('should open the column editor from a button beside the grip', () => {
    render(
      <KnowledgeBrowserTable
        rows={[item]}
        columnOrder={defaultOrder}
        onColumnOrderChange={vi.fn()}
        {...selectionProps}
        columnFilters={{ isFiltered: () => false, renderEditor: (id) => <p>editor for {id}</p> }}
      />,
    )

    fireEvent.click(screen.getByRole('button', { name: 'Filter Answer' }))

    expect(screen.getByText('editor for answer')).toBeTruthy()
    expect(screen.queryByText('editor for source')).toBeNull()
  })

  it('should mark a filtered column in its header and no other', () => {
    render(
      <KnowledgeBrowserTable
        rows={[item]}
        columnOrder={defaultOrder}
        onColumnOrderChange={vi.fn()}
        {...selectionProps}
        columnFilters={{ isFiltered: (id) => id === 'source', renderEditor: () => <p>editor</p> }}
      />,
    )

    expect(screen.getByTestId('browser-column-filtered-source')).toBeTruthy()
    expect(screen.queryByTestId('browser-column-filtered-answer')).toBeNull()
  })

  it('should show a whole-number match percentage in the question cell only for meaning matches', () => {
    render(
      <KnowledgeBrowserTable
        rows={[{ ...item, similarity: 0.874 } as KnowledgeBitBrowserItem, { ...item, knowledgeBitId: 'b2' }]}
        columnOrder={defaultOrder}
        onColumnOrderChange={vi.fn()}
        {...selectionProps}
      />,
    )

    const percents = screen.getAllByTestId('knowledge-browser-match-percent')

    expect(percents).toHaveLength(1)
    expect(percents[0].textContent).toBe('87% match')
  })
})
