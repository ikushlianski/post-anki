// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import type { KnowledgeBitOverviewItem } from '@post-anki/shared'

import { KnowledgeOverviewTable } from './knowledge-overview-table'

vi.mock('./knowledge-bit-chat.api', () => ({
  askKnowledgeBitChat: vi.fn(),
  draftKnowledgeBitChat: vi.fn(),
  createKnowledgeItemFromChat: vi.fn(),
}))

beforeEach(() => window.localStorage.clear())

afterEach(cleanup)

function makeRow(
  id: string,
  sourceLinks: string[] = [],
  state: KnowledgeBitOverviewItem['state'] = 'new',
): KnowledgeBitOverviewItem {
  return {
    knowledgeBitId: id,
    question: `Question ${id}`,
    answer: `Answer ${id}`,
    subjectId: null,
    state,
    dueAt: null,
    lapses: 0,
    sourceLinks,
  }
}

function renderTable(rows: KnowledgeBitOverviewItem[], onToggleSuspend = vi.fn()) {
  return render(
    <QueryClientProvider client={new QueryClient()}>
      <KnowledgeOverviewTable
        rows={rows}
        selected={new Set()}
        cursorId={null}
        focusRequest={null}
        rowStates={{}}
        subjectLabel={() => ''}
        onKeyDown={() => undefined}
        onRowFocus={() => undefined}
        onCheckboxClick={() => undefined}
        onToggleSuspend={onToggleSuspend}
      />
    </QueryClientProvider>,
  )
}

describe('KnowledgeOverviewTable chat', () => {
  it('should offer a chat toggle on every approved item in the overview', () => {
    renderTable([makeRow('a'), makeRow('b')])

    expect(screen.getAllByTestId('knowledge-bit-chat-open')).toHaveLength(2)
  })

  it('should open the chat panel for the item whose toggle was clicked', async () => {
    const user = userEvent.setup()

    renderTable([makeRow('a'), makeRow('b')])

    await user.click(screen.getAllByTestId('knowledge-bit-chat-open')[0])

    expect(screen.getAllByTestId('knowledge-bit-chat-panel')).toHaveLength(1)
    expect(screen.getAllByTestId('knowledge-bit-chat-open')).toHaveLength(1)
  })

  it('should show no chat toggle when the overview has no items', () => {
    renderTable([])

    expect(screen.queryByTestId('knowledge-bit-chat-open')).toBeNull()
  })
})

describe('KnowledgeOverviewTable source link', () => {
  it('should link a card row back to its original source in a new tab', () => {
    renderTable([makeRow('a', ['https://example.com/article'])])

    const link = screen.getByTestId('knowledge-overview-source-a')

    expect(link.textContent).toBe('Source: example.com')
    expect(link.getAttribute('href')).toBe('https://example.com/article')
    expect(link.getAttribute('target')).toBe('_blank')
    expect(link.getAttribute('rel')).toBe('noopener noreferrer')
  })

  it('should show no source link for a missing or unsafe address', () => {
    renderTable([makeRow('a'), makeRow('b', ['javascript:alert(1)', 'data:text/html,x'])])

    expect(screen.queryByTestId('knowledge-overview-source-a')).toBeNull()
    expect(screen.queryByTestId('knowledge-overview-source-b')).toBeNull()
  })
})

describe('KnowledgeOverviewTable layout', () => {
  it('should put the chat button in its own column before Question', () => {
    renderTable([makeRow('a')])

    const headers = screen.getAllByRole('columnheader')
    const cells = within(screen.getByTestId('knowledge-overview-row-a')).getAllByRole('gridcell')
    const chat = within(cells[1]).getByTestId('knowledge-bit-chat-open')

    expect(headers[1].textContent).toContain('Chat')
    expect(headers[2].textContent).toContain('Question')
    expect(chat.getAttribute('aria-label')).toBe('Chat about this')
    expect(cells[2].textContent).toContain('Question a')
  })
})

describe('KnowledgeOverviewTable suspend', () => {
  it('should hide Suspend until the card actions menu is opened', async () => {
    renderTable([makeRow('a')])

    expect(screen.queryByTestId('knowledge-overview-suspend-a')).toBeNull()

    await userEvent.click(screen.getByTestId('knowledge-overview-menu-a'))

    expect(screen.getByTestId('knowledge-overview-suspend-a').textContent).toBe('Suspend')
  })

  it('should suspend the card chosen from its menu', async () => {
    const onToggleSuspend = vi.fn()
    const row = makeRow('a')

    renderTable([row], onToggleSuspend)
    await userEvent.click(screen.getByTestId('knowledge-overview-menu-a'))
    await userEvent.click(screen.getByTestId('knowledge-overview-suspend-a'))

    expect(onToggleSuspend).toHaveBeenCalledWith(row)
    expect(screen.queryByTestId('knowledge-overview-suspend-a')).toBeNull()
  })

  it('should offer Unsuspend for a suspended card', async () => {
    renderTable([makeRow('a', [], 'suspended')])
    await userEvent.click(screen.getByTestId('knowledge-overview-menu-a'))

    expect(screen.getByTestId('knowledge-overview-suspend-a').textContent).toBe('Unsuspend')
  })
})

describe('KnowledgeOverviewTable column widths', () => {
  it('should start with the default column widths', () => {
    const { container } = renderTable([makeRow('a')])
    const widths = Array.from(container.querySelectorAll('col')).map((col) => col.style.width)

    expect(widths).toEqual(['40px', '48px', '280px', '420px', '160px', '110px', '72px'])
  })

  it('should resize a column from the keyboard and remember it', async () => {
    const { container, unmount } = renderTable([makeRow('a')])

    screen.getByTestId('knowledge-overview-resize-question').focus()
    await userEvent.keyboard('{ArrowRight}')

    expect(container.querySelectorAll('col')[2].style.width).toBe('296px')
    expect(JSON.parse(window.localStorage.getItem('post-anki:column-widths:knowledge-overview') ?? '{}').question).toBe(296)
    unmount()

    const again = renderTable([makeRow('a')])

    expect(again.container.querySelectorAll('col')[2].style.width).toBe('296px')
  })

  it('should resize a column by dragging its header edge', () => {
    const { container } = renderTable([makeRow('a')])
    const handle = screen.getByTestId('knowledge-overview-resize-answer')

    fireEvent.pointerDown(handle, { clientX: 500, pointerId: 1 })
    fireEvent.pointerMove(handle, { clientX: 450, pointerId: 1 })
    fireEvent.pointerUp(handle, { clientX: 450, pointerId: 1 })

    expect(container.querySelectorAll('col')[3].style.width).toBe('370px')
  })
})
