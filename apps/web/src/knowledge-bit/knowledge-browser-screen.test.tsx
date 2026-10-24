// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
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
  KnowledgeBrowserTable: () => <p data-testid="card-table" />,
}))

vi.mock('./use-knowledge-overview-subjects', () => ({
  useKnowledgeOverviewSubjects: () => ({ options: [], labelFor: () => 'Math' }),
}))

const rowsHook = vi.hoisted(() => ({ calls: [] as (string | null)[] }))

vi.mock('./use-knowledge-browser-data', () => ({
  useKnowledgeBrowserRows: (subjectId: string | null) => {
    rowsHook.calls.push(subjectId)

    return {
      rows: [{ knowledgeBitId: 'b1' }],
      isPending: false,
      isError: false,
      hasMore: false,
      loadingMore: false,
      loadMore: vi.fn(),
      retry: vi.fn(),
    }
  },
}))

const columnsHook = vi.hoisted(() => ({ ids: [] as string[] }))

vi.mock('./use-knowledge-browser-column-order', () => ({
  useKnowledgeBrowserColumnOrder: (id: string) => {
    columnsHook.ids.push(id)

    return { order: [], changeOrder: vi.fn(), reset: vi.fn(), isDefault: true }
  },
}))

import { KnowledgeBrowserScreen } from './knowledge-browser-screen'

afterEach(() => {
  cleanup()
  rowsHook.calls.length = 0
  columnsHook.ids.length = 0
})

describe('KnowledgeBrowserScreen', () => {
  it('should show every approved card across subjects with its own saved column order when no subject is chosen', () => {
    render(<KnowledgeBrowserScreen subjectId={null} />)

    expect(screen.getByTestId('card-table')).toBeTruthy()
    expect(screen.queryByTestId('subject-list')).toBeNull()
    expect(rowsHook.calls).toEqual([null])
    expect(columnsHook.ids).toEqual(['all-subjects'])
  })

  it('should show the subject list when the Subjects view is asked for', () => {
    render(<KnowledgeBrowserScreen subjectId={null} view="subjects" />)

    expect(screen.getByTestId('subject-list')).toBeTruthy()
    expect(screen.queryByTestId('card-table')).toBeNull()
  })

  it('should show only that subject table with its own column order when a subject is chosen', () => {
    render(<KnowledgeBrowserScreen subjectId="s1" />)

    expect(screen.getByTestId('card-table')).toBeTruthy()
    expect(rowsHook.calls).toEqual(['s1'])
    expect(columnsHook.ids).toEqual(['s1'])
  })
})
