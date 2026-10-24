// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import type { KnowledgeBitOverviewItem } from '@post-anki/shared'

import { KnowledgeOverviewTable } from './knowledge-overview-table'

vi.mock('./knowledge-bit-chat.api', () => ({
  askKnowledgeBitChat: vi.fn(),
  draftKnowledgeBitChat: vi.fn(),
  createKnowledgeItemFromChat: vi.fn(),
}))

afterEach(cleanup)

function makeRow(id: string, sourceLinks: string[] = []): KnowledgeBitOverviewItem {
  return {
    knowledgeBitId: id,
    question: `Question ${id}`,
    answer: `Answer ${id}`,
    subjectId: null,
    state: 'new',
    dueAt: null,
    lapses: 0,
    sourceLinks,
  }
}

function renderTable(rows: KnowledgeBitOverviewItem[]) {
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
        onToggleSuspend={() => undefined}
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
