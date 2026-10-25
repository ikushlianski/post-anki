// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'

import { KnowledgeOverviewPage } from './knowledge-overview-page'
import type { KnowledgeOverviewPageProps } from './knowledge-overview-page'

vi.mock('./knowledge-bit-chat.api', () => ({
  askKnowledgeBitChat: vi.fn(),
  draftKnowledgeBitChat: vi.fn(),
  createKnowledgeItemFromChat: vi.fn(),
}))

vi.mock('./knowledge-overview-download', () => ({
  KnowledgeOverviewDownload: () => null,
}))

afterEach(cleanup)

const OPTIONS = [
  { id: 's1', label: 'Biology' },
  { id: 's2', label: 'Chemistry' },
  { id: 's3', label: 'Physics' },
]

function renderPage(overrides: Partial<KnowledgeOverviewPageProps> = {}) {
  const props: KnowledgeOverviewPageProps = {
    rows: [],
    subjectOptions: OPTIONS,
    subjectId: '',
    search: '',
    selected: new Set(),
    cursorId: null,
    focusRequest: null,
    rowStates: {},
    hasMore: false,
    loadingMore: false,
    subjectLabel: () => '',
    onSubjectChange: vi.fn(),
    onSearchChange: vi.fn(),
    onKeyDown: vi.fn(),
    onRowFocus: vi.fn(),
    onCheckboxClick: vi.fn(),
    onToggleSuspend: vi.fn(),
    onDelete: vi.fn(),
    onMove: vi.fn(),
    onBulkSuspend: vi.fn(),
    onClear: vi.fn(),
    onLoadMore: vi.fn(),
    ...overrides,
  }

  render(
    <QueryClientProvider client={new QueryClient()}>
      <KnowledgeOverviewPage {...props} />
    </QueryClientProvider>,
  )

  return props
}

describe('KnowledgeOverviewPage selection bar', () => {
  it('should show disabled actions while nothing is selected', () => {
    renderPage()

    expect(screen.getByTestId('knowledge-overview-selection-bar').textContent).toContain('None selected')
    expect(screen.getByTestId('knowledge-overview-bulk-suspend').hasAttribute('disabled')).toBe(true)
    expect(screen.getByTestId('knowledge-overview-bulk-unsuspend').hasAttribute('disabled')).toBe(true)
  })

  it('should show the selected count and enable actions once cards are selected', () => {
    renderPage({ selected: new Set(['a', 'b']) })

    expect(screen.getByTestId('knowledge-overview-selection-bar').textContent).toContain('Selected 2')
    expect(screen.getByTestId('knowledge-overview-bulk-suspend').hasAttribute('disabled')).toBe(false)
  })

  it('should suspend every selected card from the bar', async () => {
    const props = renderPage({ selected: new Set(['a', 'b']) })

    await userEvent.click(screen.getByTestId('knowledge-overview-bulk-suspend'))

    expect(props.onBulkSuspend).toHaveBeenCalledWith(true)
  })

  it('should unsuspend every selected card from the bar', async () => {
    const props = renderPage({ selected: new Set(['a']) })

    await userEvent.click(screen.getByTestId('knowledge-overview-bulk-unsuspend'))

    expect(props.onBulkSuspend).toHaveBeenCalledWith(false)
  })
})

describe('KnowledgeOverviewPage subject filter', () => {
  it('should narrow the options as the user types', async () => {
    renderPage()

    await userEvent.type(screen.getByTestId('knowledge-overview-subject-filter'), 'chem')

    expect(screen.getByTestId('knowledge-overview-subject-filter-option-s2')).toBeTruthy()
    expect(screen.queryByTestId('knowledge-overview-subject-filter-option-s1')).toBeNull()
  })

  it('should filter by the subject the user picks', () => {
    const props = renderPage()

    fireEvent.click(screen.getByTestId('knowledge-overview-subject-filter'))
    fireEvent.mouseDown(screen.getByTestId('knowledge-overview-subject-filter-option-s3'))

    expect(props.onSubjectChange).toHaveBeenCalledWith('s3')
  })

  it('should show all subjects again when the text is cleared', async () => {
    const props = renderPage({ subjectId: 's1' })
    const input = screen.getByTestId('knowledge-overview-subject-filter')

    await userEvent.clear(input)
    await userEvent.click(document.body)

    expect(props.onSubjectChange).toHaveBeenCalledWith('')
  })
})
