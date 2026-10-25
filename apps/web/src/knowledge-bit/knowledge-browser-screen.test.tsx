// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import type { ReactNode } from 'react'

vi.mock('@tanstack/react-router', () => ({
  Link: ({ children, to: _to, search: _search, ...rest }: { children: ReactNode; to?: string; search?: unknown } & Record<string, unknown>) => (
    <a href="#" {...rest}>
      {children}
    </a>
  ),
}))

vi.mock('./knowledge-browser-subject-list', () => ({
  NO_SUBJECT_PARAM: 'none',
  KnowledgeBrowserSubjectList: () => <p data-testid="subject-list" />,
}))

vi.mock('./knowledge-browser-table', () => ({
  KnowledgeBrowserTable: ({ rows }: { rows: { knowledgeBitId: string }[] }) => (
    <p data-testid="card-table">{rows.map((row) => row.knowledgeBitId).join(',')}</p>
  ),
}))

vi.mock('./use-knowledge-overview-subjects', () => ({
  useKnowledgeOverviewSubjects: () => ({ options: [], labelFor: () => 'Math' }),
}))

vi.mock('./use-knowledge-browser-selection-delete', () => ({
  useKnowledgeBrowserSelectionDelete: () => ({
    selected: new Set<string>(),
    count: 0,
    unselectedCount: 0,
    confirming: false,
    toggleRow: vi.fn(),
    toggleAll: vi.fn(),
  }),
}))

vi.mock('./use-knowledge-browser-source-delete', () => ({
  useKnowledgeBrowserSourceDelete: () => ({ sourceId: null, hiddenCount: 0, countFor: () => 0, open: vi.fn() }),
}))

const rowsHook = vi.hoisted(() => ({
  calls: [] as (string | null)[],
  filterCalls: [] as unknown[],
  rows: [{ knowledgeBitId: 'b1' }] as { knowledgeBitId: string }[],
}))

vi.mock('./use-knowledge-browser-data', () => ({
  useKnowledgeBrowserRows: (subjectId: string | null, filters: unknown) => {
    rowsHook.calls.push(subjectId)
    rowsHook.filterCalls.push(filters)

    return {
      rows: rowsHook.rows,
      total: rowsHook.rows.length,
      isPending: false,
      isError: false,
      hasMore: false,
      loadingMore: false,
      loadMore: vi.fn(),
      retry: vi.fn(),
    }
  },
}))

const matchesHook = vi.hoisted(() => ({
  calls: [] as unknown[][],
  state: {
    active: false,
    status: 'off',
    rows: [] as { knowledgeBitId: string }[],
    readyCount: 0,
    notReadyCount: 0,
    capped: false,
    errorCode: null,
    retry: vi.fn(),
  },
}))

vi.mock('./use-knowledge-browser-matches', () => ({
  useKnowledgeBrowserMatches: (...args: unknown[]) => {
    matchesHook.calls.push(args)

    return matchesHook.state
  },
}))

const columnsHook = vi.hoisted(() => ({ ids: [] as string[] }))

vi.mock('./use-knowledge-browser-column-order', () => ({
  useKnowledgeBrowserColumnOrder: (id: string) => {
    columnsHook.ids.push(id)

    return { order: [], hidden: [], allColumns: [], changeOrder: vi.fn(), toggle: vi.fn(), reset: vi.fn(), isDefault: true }
  },
}))

import { KnowledgeBrowserScreen } from './knowledge-browser-screen'

afterEach(() => {
  cleanup()
  rowsHook.calls.length = 0
  rowsHook.filterCalls.length = 0
  rowsHook.rows = [{ knowledgeBitId: 'b1' }]
  columnsHook.ids.length = 0
  matchesHook.calls.length = 0
  matchesHook.state = {
    active: false,
    status: 'off',
    rows: [],
    readyCount: 0,
    notReadyCount: 0,
    capped: false,
    errorCode: null,
    retry: vi.fn(),
  }
})

describe('KnowledgeBrowserScreen', () => {
  it('should show every approved card across subjects with its own saved column order when no subject is chosen', () => {
    render(<KnowledgeBrowserScreen subjectId={null} />)

    expect(screen.getByTestId('card-table')).toBeTruthy()
    expect(screen.queryByTestId('subject-list')).toBeNull()
    expect(rowsHook.calls).toEqual([null])
    expect(columnsHook.ids).toEqual(['all-subjects'])
  })

  it('should show only that subject table with its own column order when a subject is chosen', () => {
    render(<KnowledgeBrowserScreen subjectId="s1" />)

    expect(screen.getByTestId('card-table')).toBeTruthy()
    expect(rowsHook.calls).toEqual(['s1'])
    expect(columnsHook.ids).toEqual(['s1'])
  })

  it('should read the rows with the filters from the page address', () => {
    render(<KnowledgeBrowserScreen subjectId={null} filters={{ question: 'pod' }} />)

    expect(rowsHook.filterCalls).toEqual([{ question: 'pod' }])
  })

  it('should say nothing matches and offer Clear all when filters leave no rows', () => {
    const onClearAll = vi.fn()

    rowsHook.rows = []
    render(<KnowledgeBrowserScreen subjectId={null} filters={{ question: 'zzz' }} onClearAll={onClearAll} />)

    expect(screen.getByTestId('knowledge-browser-no-match')).toBeTruthy()
    expect(screen.queryByTestId('knowledge-browser-empty')).toBeNull()

    fireEvent.click(screen.getByTestId('knowledge-browser-no-match-clear'))

    expect(onClearAll).toHaveBeenCalledOnce()
  })

  it('should keep the empty collection message when no filter is set', () => {
    rowsHook.rows = []
    render(<KnowledgeBrowserScreen subjectId={null} />)

    expect(screen.getByTestId('knowledge-browser-empty').textContent).toBe('No approved knowledge yet.')
    expect(screen.queryByTestId('knowledge-browser-no-match')).toBeNull()
  })

  it('should keep the toolbar on screen even when no rows match', () => {
    rowsHook.rows = []
    render(<KnowledgeBrowserScreen subjectId={null} filters={{ answer: 'x' }} />)

    expect(screen.getByTestId('knowledge-browser-toolbar')).toBeTruthy()
  })

  it('should list the meaning matches instead of the newest-first rows while a meaning search is active', () => {
    matchesHook.state = { ...matchesHook.state, active: true, status: 'success', readyCount: 2, rows: [{ knowledgeBitId: 'm1' }, { knowledgeBitId: 'm2' }] }
    render(<KnowledgeBrowserScreen subjectId="s1" filters={{ question: 'x' }} meaningWords="heart" />)

    expect(screen.getByTestId('card-table').textContent).toBe('m1,m2')
    expect(matchesHook.calls[0]).toEqual(['heart', 's1', { question: 'x' }])
  })

  it('should not offer Load more or the filter empty message in meaning mode', () => {
    rowsHook.rows = []
    matchesHook.state = { ...matchesHook.state, active: true, status: 'success', readyCount: 3 }
    render(<KnowledgeBrowserScreen subjectId={null} filters={{ question: 'x' }} meaningWords="heart" />)

    expect(screen.queryByTestId('knowledge-browser-no-match')).toBeNull()
    expect(screen.queryByTestId('knowledge-browser-load-more')).toBeNull()
    expect(screen.getByTestId('meaning-status-nothing-close')).toBeTruthy()
  })

  it('should return to the newest-first rows when no meaning words are set', () => {
    render(<KnowledgeBrowserScreen subjectId={null} />)

    expect(screen.getByTestId('card-table').textContent).toBe('b1')
    expect(screen.getByTestId('meaning-search-input')).toBeTruthy()
  })

  it('should hand the typed words to the address only when the owner submits', () => {
    const onMeaningWordsChange = vi.fn()

    render(<KnowledgeBrowserScreen subjectId={null} onMeaningWordsChange={onMeaningWordsChange} />)
    fireEvent.change(screen.getByTestId('meaning-search-input'), { target: { value: 'heart pump' } })

    expect(onMeaningWordsChange).not.toHaveBeenCalled()

    fireEvent.submit(screen.getByTestId('meaning-search-form'))

    expect(onMeaningWordsChange).toHaveBeenCalledWith('heart pump')
  })
})
