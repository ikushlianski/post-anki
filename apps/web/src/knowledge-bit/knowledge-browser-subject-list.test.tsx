// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
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

const counts = vi.hoisted(() => ({ value: { counts: [] as { subjectId: string | null; count: number }[], isPending: false, isError: false, retry: vi.fn() } }))

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
    const entries = buildBrowserSubjectEntries(options, [{ subjectId: 'ru', count: 4 }])

    expect(entries).toEqual([
      { id: 'lang', label: 'Languages', count: 4 },
      { id: 'ru', label: 'Languages › Russian', count: 4 },
      { id: 'empty', label: 'Empty', count: 0 },
    ])
  })

  it('should list pieces without a subject as their own entry', () => {
    const entries = buildBrowserSubjectEntries(options, [{ subjectId: null, count: 2 }])

    expect(entries.at(-1)).toEqual({ id: 'none', label: 'No subject', count: 2 })
  })
})

describe('KnowledgeBrowserSubjectList', () => {
  it('should open the subject table by linking with the subject id', () => {
    counts.value = { counts: [{ subjectId: 'ru', count: 4 }], isPending: false, isError: false, retry: vi.fn() }
    render(<KnowledgeBrowserSubjectList />)

    expect(screen.getByTestId('knowledge-browser-subject-ru').getAttribute('data-subject')).toBe('ru')
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
