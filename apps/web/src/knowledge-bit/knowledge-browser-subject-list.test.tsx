// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import type { ReactNode } from 'react'

vi.mock('@tanstack/react-router', () => ({
  Link: ({ children, search, to: _to, ...rest }: { children: ReactNode; search?: { subject: string }; to?: string } & Record<string, unknown>) => (
    <a href="#" data-subject={search?.subject} {...rest}>
      {children}
    </a>
  ),
}))

vi.mock('./use-knowledge-overview-subjects', () => ({
  useKnowledgeOverviewSubjects: () => ({
    options: [
      { id: 'lang', label: 'Languages' },
      { id: 'ru', label: 'Languages › Russian' },
      { id: 'empty', label: 'Empty' },
    ],
    labelFor: () => '',
  }),
}))

const counts = vi.hoisted(() => ({ value: { counts: [] as { subjectId: string | null; count: number; newCount: number; learningCount: number; matureCount: number }[], isPending: false, isError: false, retry: vi.fn() } }))

vi.mock('./use-knowledge-browser-data', () => ({
  useKnowledgeBrowserSubjectCounts: () => counts.value,
}))

import { KnowledgeBrowserSubjectList, buildBrowserSubjectEntries } from './knowledge-browser-subject-list'

afterEach(cleanup)

describe('buildBrowserSubjectEntries', () => {
  const options = [
    { id: 'lang', label: 'Languages' },
    { id: 'ru', label: 'Languages › Russian' },
    { id: 'empty', label: 'Empty' },
  ]

  it('should count a parent subject together with its sub-subjects and still list subjects with no cards', () => {
    const entries = buildBrowserSubjectEntries(options, [{ subjectId: 'ru', count: 4, newCount: 1, learningCount: 1, matureCount: 2 }])

    expect(entries).toEqual([
      { id: 'lang', label: 'Languages', count: 4, newCount: 1, learningCount: 1, matureCount: 2 },
      { id: 'ru', label: 'Languages › Russian', count: 4, newCount: 1, learningCount: 1, matureCount: 2 },
      { id: 'empty', label: 'Empty', count: 0, newCount: 0, learningCount: 0, matureCount: 0 },
    ])
  })

  it('should list pieces without a subject as their own entry', () => {
    const entries = buildBrowserSubjectEntries(options, [{ subjectId: null, count: 2, newCount: 2, learningCount: 0, matureCount: 0 }])

    expect(entries.at(-1)).toEqual({ id: 'none', label: 'No subject', count: 2, newCount: 2, learningCount: 0, matureCount: 0 })
  })
})

describe('KnowledgeBrowserSubjectList', () => {
  it('should open the subject table by linking with the subject id', () => {
    counts.value = { counts: [{ subjectId: 'ru', count: 4, newCount: 1, learningCount: 1, matureCount: 2 }], isPending: false, isError: false, retry: vi.fn() }
    render(<KnowledgeBrowserSubjectList />)
    fireEvent.click(screen.getByTestId('knowledge-browser-subject-toggle-lang'))

    expect(screen.getByTestId('knowledge-browser-subject-ru').getAttribute('data-subject')).toBe('ru')
  })

  it('should hide a sub-subject under its parent until the parent is expanded with +', () => {
    counts.value = { counts: [{ subjectId: 'ru', count: 4, newCount: 1, learningCount: 1, matureCount: 2 }], isPending: false, isError: false, retry: vi.fn() }
    render(<KnowledgeBrowserSubjectList />)

    expect(screen.queryByTestId('knowledge-browser-subject-ru')).toBeNull()

    fireEvent.click(screen.getByTestId('knowledge-browser-subject-toggle-lang'))

    expect(screen.getByTestId('knowledge-browser-subject-ru').textContent).toContain('Russian')
    expect(screen.getByTestId('knowledge-browser-subject-toggle-lang').textContent).toBe('−')

    fireEvent.click(screen.getByTestId('knowledge-browser-subject-toggle-lang'))

    expect(screen.queryByTestId('knowledge-browser-subject-ru')).toBeNull()
  })

  it('should draw the depth bar from mature, learning and new shares and name them for hover and screen readers', () => {
    counts.value = { counts: [{ subjectId: 'ru', count: 4, newCount: 1, learningCount: 1, matureCount: 2 }], isPending: false, isError: false, retry: vi.fn() }
    render(<KnowledgeBrowserSubjectList />)

    const bar = screen.getByTestId('knowledge-browser-subject-depth-lang')

    expect(bar.getAttribute('aria-label')).toBe('2 mature, 1 learning, 1 new')
    expect(bar.querySelector('[data-part="mature"]')?.getAttribute('style')).toContain('width: 50%')
  })

  it('should show a pointer cursor on the expand and collapse button', () => {
    counts.value = { counts: [], isPending: false, isError: false, retry: vi.fn() }
    render(<KnowledgeBrowserSubjectList />)

    expect(screen.getByTestId('knowledge-browser-subject-toggle-lang').className).toContain('cursor-pointer')
  })

  it('should list every subject even when no card has been approved yet', () => {
    counts.value = { counts: [], isPending: false, isError: false, retry: vi.fn() }
    render(<KnowledgeBrowserSubjectList />)

    expect(screen.getByTestId('knowledge-browser-subject-empty')).toBeTruthy()
  })

  it('should offer a retry when loading fails', () => {
    counts.value = { counts: [], isPending: false, isError: true, retry: vi.fn() }
    render(<KnowledgeBrowserSubjectList />)

    expect(screen.getByTestId('knowledge-browser-retry')).toBeTruthy()
  })
})
