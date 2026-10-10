// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import type { ReactNode } from 'react'

import type { Subject } from '../curriculum/model'
import { buildSubjectTree, DashboardSubjectList } from './dashboard-subject-list'
import { EXPANDED_SUBJECTS_STORAGE_KEY, parseExpandedSubjects } from './subject-expansion'

vi.mock('@tanstack/react-router', () => ({
  Link: ({
    to,
    params,
    children,
    ...rest
  }: {
    to: string
    params?: Record<string, string>
    children: ReactNode
    'data-testid'?: string
  }) => (
    <a href={`${to}?${JSON.stringify(params ?? {})}`} {...rest}>
      {children}
    </a>
  ),
}))

afterEach(() => {
  cleanup()
  window.localStorage.clear()
  vi.clearAllMocks()
})

function subject(id: string, name: string, parentId: string | null = null): Subject {
  return { id, name, kind: 'architecture-mentor', requireSources: false, modelTier: null, parentId }
}

const PROGRAMMING = subject('sub-programming', 'Programming / Web Development')
const TREE: Subject[] = [
  subject('sub-business', 'Business'),
  subject('sub-marketing', 'Marketing', 'sub-business'),
  subject('sub-sales', 'Sales', 'sub-business'),
  PROGRAMMING,
  subject('sub-databases', 'Databases', PROGRAMMING.id),
  subject('sub-ai', 'AI', PROGRAMMING.id),
]

function renderList(subjects: Subject[] = TREE) {
  render(
    <DashboardSubjectList
      subjects={subjects}
      curricula={[]}
      onRenameSubject={vi.fn(async () => true)}
      onDeleteSubject={vi.fn(async () => true)}
      onCreateSubSubject={vi.fn(async () => true)}
      onMoveSubject={vi.fn(async () => true)}
    />,
  )
}

function itemFor(name: string): HTMLElement {
  return screen.getByRole('link', { name: new RegExp(name) }).closest('li') as HTMLElement
}

describe('DashboardSubjectList', () => {
  it('should show a parent collapsed by default with a count of its sub-subjects', () => {
    renderList()

    const toggle = screen.getByRole('button', { name: 'Expand Business' })

    expect(toggle.getAttribute('aria-expanded')).toBe('false')
    expect(screen.getByTestId('subject-children-count-sub-business').textContent).toBe('2 sub-subjects')
    expect(screen.queryByRole('link', { name: /Marketing/ })).toBeNull()
  })

  it('should show the sub-subjects nested under the parent when expanded', () => {
    renderList()

    fireEvent.click(screen.getByRole('button', { name: 'Expand Business' }))

    const toggle = screen.getByRole('button', { name: 'Collapse Business' })
    const childList = document.getElementById(toggle.getAttribute('aria-controls') ?? '')

    expect(toggle.getAttribute('aria-expanded')).toBe('true')
    expect(childList).not.toBeNull()
    expect(within(childList as HTMLElement).getByRole('link', { name: /Marketing/ })).toBeTruthy()
    expect(within(childList as HTMLElement).getByRole('link', { name: /Sales/ })).toBeTruthy()
    expect(screen.queryByTestId('subject-children-count-sub-business')).toBeNull()
  })

  it('should keep a nested child indented one level deeper than its parent', () => {
    renderList()

    fireEvent.click(screen.getByRole('button', { name: 'Expand Programming / Web Development' }))

    expect(itemFor('Databases').getAttribute('data-depth')).toBe('1')
    expect(itemFor('Programming').getAttribute('data-depth')).toBe('0')
  })

  it('should not open the subject page or the ⋯ menu when the toggle is pressed', () => {
    renderList()

    const toggle = screen.getByRole('button', { name: 'Expand Business' })

    expect(toggle.closest('a')).toBeNull()

    fireEvent.click(toggle)

    expect(screen.queryByRole('menu')).toBeNull()
  })

  it('should remember each subject expanded state in localStorage across remounts', () => {
    const first = render(
      <DashboardSubjectList
        subjects={TREE}
        curricula={[]}
        onRenameSubject={vi.fn(async () => true)}
        onDeleteSubject={vi.fn(async () => true)}
        onCreateSubSubject={vi.fn(async () => true)}
        onMoveSubject={vi.fn(async () => true)}
      />,
    )

    fireEvent.click(screen.getByRole('button', { name: 'Expand Business' }))

    expect(parseExpandedSubjects(window.localStorage.getItem(EXPANDED_SUBJECTS_STORAGE_KEY))).toEqual({
      'sub-business': true,
    })

    first.unmount()
    renderList()

    expect(screen.getByRole('button', { name: 'Collapse Business' }).getAttribute('aria-expanded')).toBe('true')
    expect(screen.getByRole('button', { name: 'Expand Programming / Web Development' })).toBeTruthy()
  })

  it('should not show a toggle on a subject without sub-subjects', () => {
    renderList([subject('sub-solo', 'Solo')])

    expect(screen.queryByRole('button', { name: 'Expand Solo' })).toBeNull()
    expect(screen.queryByRole('button', { name: 'Collapse Solo' })).toBeNull()
  })
})

describe('buildSubjectTree', () => {
  it('should list subjects in a parent cycle instead of dropping them', () => {
    const cyclic = [subject('a', 'A', 'b'), subject('b', 'B', 'a')]

    const tree = buildSubjectTree(cyclic)

    expect(tree.flatMap((node) => [node.subject.id, ...node.children.map((c) => c.subject.id)]).sort()).toEqual([
      'a',
      'b',
    ])
  })

  it('should show a subject whose parent is not in the list at the top level', () => {
    const tree = buildSubjectTree([subject('orphan', 'Orphan', 'missing')])

    expect(tree.map((node) => node.subject.id)).toEqual(['orphan'])
  })
})
