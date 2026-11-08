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

const subjectOptions = vi.hoisted(() => ({
  value: [
    { id: 'lang', label: 'Languages' },
    { id: 'ru', label: 'Languages › Russian' },
    { id: 'empty', label: 'Empty' },
  ],
}))

vi.mock('./use-knowledge-overview-subjects', () => ({
  useKnowledgeOverviewSubjects: () => ({
    options: subjectOptions.value,
    labelFor: () => '',
  }),
}))

const counts = vi.hoisted(() => ({ value: { counts: [] as { subjectId: string | null; count: number; newCount: number; learningCount: number; matureCount: number }[], isPending: false, isError: false, retry: vi.fn() } }))

vi.mock('../subject/subject-live-data', () => ({
  useLiveSubjects: () => [
    { id: 'lang', name: 'Languages', parentId: null, kind: 'architecture-mentor' },
    { id: 'ru', name: 'Russian', parentId: 'lang', kind: 'language-practice' },
    { id: 'empty', name: 'Empty', parentId: null },
  ],
  useLiveCurriculumCount: () => 0,
}))

vi.mock('../subject/subject.api', () => ({
  createSubject: vi.fn(),
  deleteSubject: vi.fn(),
  updateSubjectName: vi.fn(),
  updateSubjectParent: vi.fn(),
}))

const cardCountMap = vi.hoisted(() => ({ value: new Map<string, number>() }))

vi.mock('./use-subject-card-counts', () => ({
  useSubjectCardCounts: () => cardCountMap.value,
}))

vi.mock('./use-knowledge-browser-data', () => ({
  useKnowledgeBrowserSubjectCounts: () => counts.value,
}))

const todayCounts = vi.hoisted(() => ({
  value: { status: 'ready', byId: new Map<string, number>() } as
    | { status: 'ready'; byId: ReadonlyMap<string, number> }
    | { status: 'unavailable' },
}))

vi.mock('./use-subject-today-counts', () => ({
  useSubjectTodayCounts: () => todayCounts.value,
}))

import { KnowledgeBrowserSubjectList, NO_SUBJECT_PARAM, buildBrowserSubjectEntries } from './knowledge-browser-subject-list'

afterEach(cleanup)

describe('buildBrowserSubjectEntries', () => {
  const options = [
    { id: 'lang', label: 'Languages' },
    { id: 'ru', label: 'Languages › Russian' },
    { id: 'empty', label: 'Empty' },
  ]

  it('should show the counts the API sends for each subject without adding sub-subjects again, and still list subjects with no cards', () => {
    const entries = buildBrowserSubjectEntries(options, [
      { subjectId: 'lang', count: 4, newCount: 1, learningCount: 1, matureCount: 2 },
      { subjectId: 'ru', count: 4, newCount: 1, learningCount: 1, matureCount: 2 },
    ])

    expect(entries).toEqual([
      { id: 'lang', label: 'Languages', count: 4, newCount: 1, learningCount: 1, matureCount: 2 },
      { id: 'ru', label: 'Languages › Russian', count: 4, newCount: 1, learningCount: 1, matureCount: 2 },
      { id: 'empty', label: 'Empty', count: 0, newCount: 0, learningCount: 0, matureCount: 0 },
    ])
  })

  it('should prefer the subject card total from the subjects API over the browser count', () => {
    const entries = buildBrowserSubjectEntries(
      options,
      [{ subjectId: 'ru', count: 4, newCount: 1, learningCount: 1, matureCount: 2 }],
      new Map([['lang', 9], ['ru', 4]]),
    )

    expect(entries.map((entry) => [entry.id, entry.count])).toEqual([['lang', 9], ['ru', 4], ['empty', 0]])
  })

  it('should list cards without a subject as their own entry', () => {
    const entries = buildBrowserSubjectEntries(options, [{ subjectId: null, count: 2, newCount: 2, learningCount: 0, matureCount: 0 }])

    expect(entries.at(-1)).toEqual({ id: 'none', label: 'No subject', count: 2, newCount: 2, learningCount: 0, matureCount: 0 })
  })
})

describe('KnowledgeBrowserSubjectList states', () => {
  it('should announce loading to screen readers', () => {
    counts.value = { counts: [], isPending: true, isError: false, retry: vi.fn() }
    render(<KnowledgeBrowserSubjectList />)

    expect(screen.getByTestId('knowledge-browser-loading').getAttribute('role')).toBe('status')
  })

  it('should offer a way to create a subject when there are none', () => {
    const original = subjectOptions.value

    subjectOptions.value = []
    counts.value = { counts: [], isPending: false, isError: false, retry: vi.fn() }
    render(<KnowledgeBrowserSubjectList />)
    subjectOptions.value = original

    expect(screen.getByTestId('knowledge-browser-create-subject').textContent).toBe('Create a subject')
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
    counts.value = { counts: [{ subjectId: 'lang', count: 4, newCount: 1, learningCount: 1, matureCount: 2 }], isPending: false, isError: false, retry: vi.fn() }
    render(<KnowledgeBrowserSubjectList />)

    const bar = screen.getByTestId('knowledge-browser-subject-depth-lang')

    expect(bar.getAttribute('aria-label')).toBe('2 mature, 1 learning, 1 new')
    expect(bar.querySelector('[data-part="mature"]')?.getAttribute('style')).toContain('width: 50%')
  })

  it('should show a kind badge only for non-default subject kinds', () => {
    counts.value = { counts: [], isPending: false, isError: false, retry: vi.fn() }
    render(<KnowledgeBrowserSubjectList />)

    expect(screen.queryByTestId('subject-kind-badge')).toBeNull()

    fireEvent.click(screen.getByTestId('knowledge-browser-subject-toggle-lang'))

    const badge = screen.getByTestId('subject-kind-badge')

    expect(badge.textContent).toBe('Language practice')
    expect(badge.getAttribute('title')).toBe('Language practice')
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

  it('should give every subject row a menu with rename, add sub-subject, move and delete', () => {
    counts.value = { counts: [], isPending: false, isError: false, retry: vi.fn() }
    render(<KnowledgeBrowserSubjectList />)
    fireEvent.click(screen.getByTestId('subject-menu-button-lang'))

    expect(screen.getByTestId('subject-menu-rename-lang')).toBeTruthy()
    expect(screen.getByTestId('subject-menu-add-child-lang')).toBeTruthy()
    expect(screen.getByTestId('subject-menu-move-lang')).toBeTruthy()
    expect(screen.getByTestId('subject-menu-delete-lang')).toBeTruthy()
  })

  it('should warn that sub-subjects move to the top level before a subject is deleted', () => {
    counts.value = { counts: [], isPending: false, isError: false, retry: vi.fn() }
    render(<KnowledgeBrowserSubjectList />)
    fireEvent.click(screen.getByTestId('subject-menu-button-lang'))
    fireEvent.click(screen.getByTestId('subject-menu-delete-lang'))

    expect(screen.getByText(/1 sub-subject will move to the top level/)).toBeTruthy()
  })

  it('should offer a retry when loading fails', () => {
    counts.value = { counts: [], isPending: false, isError: true, retry: vi.fn() }
    render(<KnowledgeBrowserSubjectList />)

    expect(screen.getByTestId('knowledge-browser-retry')).toBeTruthy()
  })

  it('should show mature, learning, new and the Today count from the due counts for each subject', () => {
    counts.value = {
      counts: [
        { subjectId: 'lang', count: 9, newCount: 3, learningCount: 2, matureCount: 4 },
        { subjectId: null, count: 2, newCount: 2, learningCount: 0, matureCount: 0 },
      ],
      isPending: false,
      isError: false,
      retry: vi.fn(),
    }
    todayCounts.value = { status: 'ready', byId: new Map([['lang', 7], ['none', 1]]) }
    render(<KnowledgeBrowserSubjectList />)

    expect(screen.getByTestId('knowledge-browser-subject-mature-lang').textContent).toBe('4')
    expect(screen.getByTestId('knowledge-browser-subject-learning-lang').textContent).toBe('2')
    expect(screen.getByTestId('knowledge-browser-subject-new-lang').textContent).toBe('3')
    expect(screen.getByTestId('knowledge-browser-subject-today-lang').textContent).toBe('7')
    expect(screen.getByTestId('knowledge-browser-subject-columns-lang').textContent).toContain('Today')
    expect(screen.getByTestId(`knowledge-browser-subject-today-${NO_SUBJECT_PARAM}`).textContent).toBe('1')
  })

  it('should show an en dash for Today only when the due counts are unavailable', () => {
    counts.value = {
      counts: [{ subjectId: 'lang', count: 9, newCount: 3, learningCount: 2, matureCount: 4 }],
      isPending: false,
      isError: false,
      retry: vi.fn(),
    }
    todayCounts.value = { status: 'unavailable' }
    render(<KnowledgeBrowserSubjectList />)

    expect(screen.getByTestId('knowledge-browser-subject-today-lang').textContent).toBe('–')
    expect(screen.getByTestId('knowledge-browser-subject-mature-lang').textContent).toBe('4')
  })
})
