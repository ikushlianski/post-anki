// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import type { KnowledgeBitBrowserFilters, KnowledgeBitBrowserItem } from '@post-anki/shared'

vi.mock('./knowledge-browser-purge.api', () => ({ purgeKnowledgeBits: vi.fn() }))
vi.mock('./knowledge-browser-source.api', () => ({ deleteKnowledgeSourceById: vi.fn() }))

import { KnowledgeBrowserToolbar, unselectedNote } from './knowledge-browser-toolbar'
import { useKnowledgeBrowserColumnOrder } from './use-knowledge-browser-column-order'
import { useKnowledgeBrowserSelectionDelete } from './use-knowledge-browser-selection-delete'
import { useKnowledgeBrowserSourceDelete } from './use-knowledge-browser-source-delete'

const make = (id: string): KnowledgeBitBrowserItem => ({
  knowledgeBitId: id,
  phrasings: [{ id: `v-${id}`, kind: 'basic', prompt: `Q ${id}` }],
  answer: `A ${id}`,
  origin: 'article',
  sourceId: 's1',
  sourceLabel: 'Blog',
  addedAt: '2026-03-04T12:00:00.000Z',
  sourcePieceCount: 8,
})

const handlers = {
  onSubjectChange: vi.fn(),
  onFiltersChange: vi.fn(),
  onClearAll: vi.fn(),
}

function Harness({
  filters = {},
  rowIds = ['b1', 'b2', 'b3'],
  subjectId = null,
}: {
  filters?: KnowledgeBitBrowserFilters
  rowIds?: string[]
  subjectId?: string | null
}) {
  const rows = rowIds.map(make)
  const selection = useKnowledgeBrowserSelectionDelete(rowIds)
  const sourceDelete = useKnowledgeBrowserSourceDelete(rows, selection.clear)
  const columns = useKnowledgeBrowserColumnOrder('test')

  return (
    <>
      <KnowledgeBrowserToolbar
        searchSlot={<span data-testid="slot-content">search here</span>}
        subjectId={subjectId}
        subjectOptions={[
          { id: 'p', label: 'Math' },
          { id: 'c', label: 'Math › Algebra' },
        ]}
        filters={filters}
        total={filters.question ? 12 : null}
        columns={columns}
        selection={selection}
        sourceDelete={sourceDelete}
        activeSource={null}
        {...handlers}
      />
      <button type="button" onClick={() => selection.addRows(rowIds)}>
        select all rows
      </button>
      <button type="button" onClick={() => selection.toggleRow('b1', false)}>
        toggle b1
      </button>
    </>
  )
}

function renderToolbar(props: Parameters<typeof Harness>[0] = {}) {
  const view = render(
    <QueryClientProvider client={new QueryClient()}>
      <Harness {...props} />
    </QueryClientProvider>,
  )

  return {
    rerender: (next: Parameters<typeof Harness>[0]) =>
      view.rerender(
        <QueryClientProvider client={new QueryClient()}>
          <Harness {...next} />
        </QueryClientProvider>,
      ),
  }
}

afterEach(() => {
  cleanup()
  window.localStorage.clear()
  Object.values(handlers).forEach((handler) => handler.mockReset())
})

describe('KnowledgeBrowserToolbar layout', () => {
  it('should stay at the top and hold the search slot, subject, filters, columns and selection in that order', () => {
    renderToolbar()

    const toolbar = screen.getByTestId('knowledge-browser-toolbar')
    const order = ['knowledge-browser-search-slot', 'knowledge-browser-subject-button', 'knowledge-browser-filters-button', 'knowledge-browser-columns-button', 'knowledge-browser-action-bar']
    const positions = order.map((id) => [...toolbar.querySelectorAll('[data-testid]')].findIndex((el) => el.getAttribute('data-testid') === id))

    expect(toolbar.className).toContain('sticky')
    expect(positions.every((position) => position >= 0)).toBe(true)
    expect([...positions].sort((a, b) => a - b)).toEqual(positions)
    expect(within(screen.getByTestId('knowledge-browser-search-slot')).getByTestId('slot-content')).toBeTruthy()
  })

  it('should give the search box and the selection group a full line each at phone width', () => {
    renderToolbar()

    expect(screen.getByTestId('knowledge-browser-search-slot').className).toContain('basis-full')
    expect(screen.getByTestId('knowledge-browser-action-bar').className).toContain('basis-full')
    expect(screen.getByTestId('knowledge-browser-subject-button').parentElement?.parentElement?.className).toContain('basis-full')
  })

  it('should open the filters as a full-width sheet on a phone and keep them in the toolbar', () => {
    renderToolbar()
    fireEvent.click(screen.getByTestId('knowledge-browser-filters-button'))

    const panel = screen.getByTestId('knowledge-browser-filters-button-panel')

    expect(panel.className).toContain('inset-x-0')
    expect(screen.getByTestId('knowledge-browser-toolbar').contains(panel)).toBe(true)
  })
})

describe('KnowledgeBrowserToolbar filters', () => {
  it('should list every column filter and the study state in the Filters panel', () => {
    renderToolbar()
    fireEvent.click(screen.getByTestId('knowledge-browser-filters-button'))

    for (const section of ['phrasings', 'answer', 'source', 'addedBy', 'sourceUrl', 'addedAt', 'state']) {
      expect(screen.getByTestId(`filter-section-${section}`)).toBeTruthy()
    }
  })

  it('should count active filters on the button and show a chip for each', () => {
    renderToolbar({ filters: { question: 'pod', origins: ['article'] } })

    expect(screen.getByTestId('knowledge-browser-filters-button').textContent).toBe('Filters (2)')
    expect(screen.getByTestId('knowledge-browser-chip-question').textContent).toContain('Question: pod')
    expect(screen.getByTestId('knowledge-browser-chip-origins').textContent).toContain('Article')
  })

  it('should show the whole matching count, not the loaded rows', () => {
    renderToolbar({ filters: { question: 'pod' } })

    expect(screen.getByTestId('knowledge-browser-total').textContent).toBe('12 matching pieces')
  })

  it('should remove only the clicked filter and clear everything with Clear all', () => {
    renderToolbar({ filters: { question: 'pod', origins: ['article'] } })

    fireEvent.click(screen.getByTestId('knowledge-browser-chip-question'))

    expect(handlers.onFiltersChange).toHaveBeenCalledWith({ origins: ['article'] }, 'push')

    fireEvent.click(screen.getByTestId('knowledge-browser-clear-all'))

    expect(handlers.onClearAll).toHaveBeenCalledOnce()
  })

  it('should hide the chip line and Clear all when no filter is set', () => {
    renderToolbar()

    expect(screen.queryByTestId('knowledge-browser-chips')).toBeNull()
    expect(screen.queryByTestId('knowledge-browser-clear-all')).toBeNull()
  })

  it('should close a popover on Escape and give focus back to its button', () => {
    renderToolbar()

    const button = screen.getByTestId('knowledge-browser-filters-button')

    fireEvent.click(button)
    fireEvent.keyDown(document, { key: 'Escape' })

    expect(screen.queryByTestId('knowledge-browser-filters-button-panel')).toBeNull()
    expect(document.activeElement).toBe(button)
  })

  it('should close a popover when the owner clicks elsewhere', () => {
    renderToolbar()
    fireEvent.click(screen.getByTestId('knowledge-browser-filters-button'))
    fireEvent.mouseDown(document.body)

    expect(screen.queryByTestId('knowledge-browser-filters-button-panel')).toBeNull()
  })
})

describe('KnowledgeBrowserToolbar subject', () => {
  it('should offer all subjects, no subject and an indented sub-subject', () => {
    renderToolbar()
    fireEvent.click(screen.getByTestId('knowledge-browser-subject-button'))

    expect(screen.getByTestId('subject-option-all')).toBeTruthy()
    expect(screen.getByTestId('subject-option-none')).toBeTruthy()
    expect(screen.getByTestId('subject-option-c').textContent).toBe('Algebra')
    expect(screen.getByTestId('subject-option-c').style.paddingLeft).toBe('1.5rem')
  })

  it('should report the chosen subject and close the list', () => {
    renderToolbar()
    fireEvent.click(screen.getByTestId('knowledge-browser-subject-button'))
    fireEvent.click(screen.getByTestId('subject-option-none'))

    expect(handlers.onSubjectChange).toHaveBeenCalledWith('none')
    expect(screen.queryByTestId('knowledge-browser-subject-button-panel')).toBeNull()
  })

  it('should name the current subject on the button', () => {
    renderToolbar({ subjectId: 'c' })

    expect(screen.getByTestId('knowledge-browser-subject-button').textContent).toBe('Subject: Math › Algebra')
  })
})

describe('KnowledgeBrowserToolbar columns', () => {
  it('should hide a column, remember it and bring it back with Reset columns', () => {
    renderToolbar()
    fireEvent.click(screen.getByTestId('knowledge-browser-columns-button'))
    fireEvent.click(screen.getByTestId('columns-toggle-sourceUrl'))

    expect((screen.getByTestId('columns-toggle-sourceUrl') as HTMLInputElement).checked).toBe(false)
    expect(window.localStorage.getItem('knowledge-browser-columns:v2:test')).toContain('"hidden":["sourceUrl"]')

    fireEvent.click(screen.getByTestId('knowledge-browser-reset-columns'))

    expect((screen.getByTestId('columns-toggle-sourceUrl') as HTMLInputElement).checked).toBe(true)
  })

  it('should refuse to hide the last visible column', () => {
    renderToolbar()
    fireEvent.click(screen.getByTestId('knowledge-browser-columns-button'))

    for (const id of ['phrasings', 'answer', 'source', 'sourceUrl', 'addedBy']) {
      fireEvent.click(screen.getByTestId(`columns-toggle-${id}`))
    }

    expect((screen.getByTestId('columns-toggle-addedAt') as HTMLInputElement).disabled).toBe(true)
  })
})

describe('KnowledgeBrowserToolbar selection', () => {
  it('should say how many selected pieces a filter change unselected', () => {
    const view = renderToolbar()

    fireEvent.click(screen.getByText('select all rows'))
    view.rerender({ rowIds: ['b1', 'b2'], filters: { question: 'x' } })

    expect(screen.getByTestId('knowledge-browser-selected-count').textContent).toBe('2 selected')
    expect(screen.getByTestId('knowledge-browser-unselected-note').textContent).toBe(
      '1 selected piece is hidden by the filters and was unselected',
    )
  })

  it('should drop the note once the owner changes the selection again', () => {
    const view = renderToolbar()

    fireEvent.click(screen.getByText('select all rows'))
    view.rerender({ rowIds: ['b1'], filters: { question: 'x' } })
    fireEvent.click(screen.getByText('toggle b1'))

    expect(screen.queryByTestId('knowledge-browser-unselected-note')).toBeNull()
  })

  it('should word the note for several pieces', () => {
    expect(unselectedNote(3)).toBe('3 selected pieces are hidden by the filters and were unselected')
  })

  it('should show the delete confirmation inside the toolbar instead of a second bar', () => {
    renderToolbar()
    fireEvent.click(screen.getByText('toggle b1'))
    fireEvent.click(screen.getByTestId('knowledge-browser-delete'))

    const dialog = screen.getByRole('alertdialog')

    expect(screen.getByTestId('knowledge-browser-toolbar').contains(dialog)).toBe(true)
    expect(document.querySelectorAll('.sticky')).toHaveLength(1)
  })
})
