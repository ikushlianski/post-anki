// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
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

describe('reorder hint and sub-subject reveal', () => {
  beforeEach(() => {
    Element.prototype.scrollIntoView = vi.fn()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  function renderWith(overrides: {
    subjects?: Subject[]
    onCreateSubSubject?: (parentId: string, name: string) => Promise<boolean>
    onMoveSubject?: (subjectId: string, parentId: string | null) => Promise<boolean>
  }) {
    const props = {
      subjects: overrides.subjects ?? TREE,
      curricula: [],
      onRenameSubject: vi.fn(async () => true),
      onDeleteSubject: vi.fn(async () => true),
      onCreateSubSubject: overrides.onCreateSubSubject ?? vi.fn(async () => true),
      onMoveSubject: overrides.onMoveSubject ?? vi.fn(async () => true),
    }

    return render(<DashboardSubjectList {...props} />)
  }

  function highlightedCardFor(subjectId: string): Element | null {
    return document.querySelector(`[data-subject-row="${subjectId}"] [data-highlighted="true"]`)
  }

  it('should show a drag hint and a larger touch-safe grip on each row', () => {
    renderList()

    expect(screen.getByTestId('subject-reorder-hint').textContent).toBe('Drag rows to reorder')

    const grip = screen.getByTestId('subject-drag-handle-sub-business')

    expect(grip.className).toContain('touch-none')
    expect(grip.className).toContain('min-h-8')
    expect(grip.getAttribute('title')).toBe('Drag rows to reorder')
  })

  it('should expand the parent after Add sub-subject succeeds', async () => {
    const onCreateSubSubject = vi.fn(async () => true)
    renderWith({ onCreateSubSubject })

    fireEvent.click(screen.getByRole('button', { name: 'Actions for Business' }))
    fireEvent.click(screen.getByRole('menuitem', { name: 'Add sub-subject' }))
    fireEvent.change(screen.getByRole('textbox', { name: 'Sub-subject name' }), {
      target: { value: 'Finance' },
    })
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Add sub-subject' }))
    })

    expect(onCreateSubSubject).toHaveBeenCalledWith('sub-business', 'Finance')
    expect(screen.getByRole('button', { name: 'Collapse Business' })).toBeDefined()
    expect(JSON.parse(window.localStorage.getItem(EXPANDED_SUBJECTS_STORAGE_KEY) ?? '{}')).toEqual({
      'sub-business': true,
    })
  })

  it('should highlight and scroll to the new sub-subject once it appears in the list', async () => {
    const onCreateSubSubject = vi.fn(async () => true)
    const { rerender } = renderWith({ onCreateSubSubject })

    fireEvent.click(screen.getByRole('button', { name: 'Actions for Business' }))
    fireEvent.click(screen.getByRole('menuitem', { name: 'Add sub-subject' }))
    fireEvent.change(screen.getByRole('textbox', { name: 'Sub-subject name' }), {
      target: { value: 'Finance' },
    })
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Add sub-subject' }))
    })

    const finance = subject('sub-finance', 'Finance', 'sub-business')

    rerender(
      <DashboardSubjectList
        subjects={[...TREE, finance]}
        curricula={[]}
        onRenameSubject={vi.fn(async () => true)}
        onDeleteSubject={vi.fn(async () => true)}
        onCreateSubSubject={onCreateSubSubject}
        onMoveSubject={vi.fn(async () => true)}
      />,
    )

    expect(highlightedCardFor('sub-finance')).not.toBeNull()
    expect(Element.prototype.scrollIntoView).toHaveBeenCalled()
  })

  it('should clear the highlight after about two seconds', async () => {
    vi.useFakeTimers()
    renderWith({})

    fireEvent.click(screen.getByRole('button', { name: 'Actions for Programming / Web Development' }))
    fireEvent.click(screen.getByRole('menuitem', { name: 'Move under…' }))
    await act(async () => {
      fireEvent.click(screen.getByTestId('subject-menu-move-target-sub-business'))
    })

    expect(highlightedCardFor(PROGRAMMING.id)).not.toBeNull()

    await act(async () => {
      await vi.advanceTimersByTimeAsync(1999)
    })

    expect(highlightedCardFor(PROGRAMMING.id)).not.toBeNull()

    await act(async () => {
      await vi.advanceTimersByTimeAsync(1)
    })

    expect(highlightedCardFor(PROGRAMMING.id)).toBeNull()
  })

  it('should expand the destination parent and highlight the moved subject', async () => {
    const onMoveSubject = vi.fn(async () => true)
    renderWith({ onMoveSubject })

    fireEvent.click(screen.getByRole('button', { name: 'Actions for Business' }))
    fireEvent.click(screen.getByRole('menuitem', { name: 'Move under…' }))
    await act(async () => {
      fireEvent.click(screen.getByTestId('subject-menu-move-target-sub-programming'))
    })

    expect(onMoveSubject).toHaveBeenCalledWith('sub-business', 'sub-programming')
    expect(screen.getByRole('button', { name: 'Collapse Programming / Web Development' })).toBeDefined()
    expect(highlightedCardFor('sub-business')).not.toBeNull()
  })

  it('should leave the parent collapsed when Add sub-subject fails', async () => {
    renderWith({ onCreateSubSubject: vi.fn(async () => false) })

    fireEvent.click(screen.getByRole('button', { name: 'Actions for Business' }))
    fireEvent.click(screen.getByRole('menuitem', { name: 'Add sub-subject' }))
    fireEvent.change(screen.getByRole('textbox', { name: 'Sub-subject name' }), {
      target: { value: 'Finance' },
    })
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Add sub-subject' }))
    })

    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Expand Business' })).toBeDefined()
    })
    expect(highlightedCardFor('sub-finance')).toBeNull()
  })
})
