// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen, within } from '@testing-library/react'
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
}

const defaultOrder: BrowserColumnId[] = ['phrasings', 'addedBy', 'addedAt', 'answer']

const selectionProps = { selected: new Set<string>(), onToggleRow: vi.fn(), onToggleAll: vi.fn() }

describe('KnowledgeBrowserTable', () => {
  it('should show every phrasing of a piece, who added it and its answer', () => {
    render(<KnowledgeBrowserTable rows={[item]} columnOrder={defaultOrder} onColumnOrderChange={vi.fn()} {...selectionProps} />)

    const row = screen.getByTestId('knowledge-browser-row')

    expect(within(row).getByText('What is a pod?')).toBeTruthy()
    expect(within(row).getByText('A ___ runs containers')).toBeTruthy()
    expect(within(row).getByText('You (typed in)')).toBeTruthy()
    expect(within(row).getByText('The smallest deployable unit')).toBeTruthy()
  })

  it('should lay the columns out in the saved order', () => {
    render(
      <KnowledgeBrowserTable
        rows={[item]}
        columnOrder={['answer', 'addedAt', 'addedBy', 'phrasings']}
        onColumnOrderChange={vi.fn()}
        {...selectionProps}
      />,
    )

    const headers = screen.getAllByRole('columnheader').map((header) => header.textContent)

    expect(headers[1]).toContain('Answer')
    expect(headers[4]).toContain('Phrasings')
  })

  it('should give each column a labelled grip to move it', () => {
    render(<KnowledgeBrowserTable rows={[item]} columnOrder={defaultOrder} onColumnOrderChange={vi.fn()} {...selectionProps} />)

    expect(screen.getByRole('button', { name: 'Move column Answer' })).toBeTruthy()
  })
})
