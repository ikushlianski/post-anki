// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import type { ReactNode } from 'react'

import type { Subject } from '../curriculum/model'
import { SubjectRowMenu } from './subject-row-menu'

const live = vi.hoisted(() => ({ curriculumCount: 0 }))

vi.mock('../subject/subject-live-data', () => ({
  useLiveCurriculumCount: () => live.curriculumCount,
}))

vi.mock('@tanstack/react-router', () => ({
  Link: ({
    to,
    params,
    search,
    children,
    ...rest
  }: {
    to: string
    params?: Record<string, string>
    search?: Record<string, string>
    children: ReactNode
    role?: string
    'data-testid'?: string
  }) => (
    <a href={`${to}?${JSON.stringify(params ?? {})}`} data-search={JSON.stringify(search ?? {})} {...rest}>
      {children}
    </a>
  ),
}))

afterEach(() => {
  cleanup()
  live.curriculumCount = 0
  vi.clearAllMocks()
})

function subject(id: string, name: string, parentId: string | null): Subject {
  return { id, name, kind: 'architecture-mentor', requireSources: false, modelTier: null, parentId }
}

const BUSINESS = subject('sub-business', 'Business', null)
const SALES = subject('sub-sales', 'Sales', 'sub-business')
const HEALTH = subject('sub-health', 'Health', null)
const FITNESS = subject('sub-fitness', 'Fitness', 'sub-health')

function renderMenu(options: {
  subject?: Subject
  allSubjects?: Subject[]
  onDelete?: (subjectId: string) => Promise<boolean>
  onMoveSubject?: (subjectId: string, parentId: string | null) => Promise<boolean>
  withHeading?: boolean
}) {
  const subjectUnderTest = options.subject ?? BUSINESS
  const onDelete = options.onDelete ?? vi.fn(async () => true)
  const onMoveSubject = options.onMoveSubject ?? vi.fn(async () => true)
  const menu = (
    <SubjectRowMenu
      subject={subjectUnderTest}
      allSubjects={options.allSubjects ?? [BUSINESS, SALES, HEALTH, FITNESS]}
      onRename={vi.fn(async () => true)}
      onDelete={onDelete}
      onCreateSubSubject={vi.fn(async () => true)}
      onMoveSubject={onMoveSubject}
    />
  )

  render(options.withHeading ? <main><h1>Post Anki</h1>{menu}</main> : menu)

  return { onDelete, onMoveSubject }
}

function openActions(name: string) {
  fireEvent.click(screen.getByRole('button', { name: `Actions for ${name}` }))
}

describe('SubjectRowMenu delete confirmation', () => {
  it('should say how many courses are deleted and how many sub-subjects move to the top level', () => {
    live.curriculumCount = 2
    renderMenu({})

    openActions('Business')
    fireEvent.click(screen.getByRole('menuitem', { name: 'Delete subject' }))

    const impact = screen.getByTestId('subject-delete-impact').textContent

    expect(impact).toContain('2 courses will be deleted')
    expect(impact).toContain('1 sub-subject will move to the top level.')
    expect(screen.getByTestId('subject-menu-confirm-delete-sub-business').textContent).toBe(
      'Delete subject and 2 courses',
    )
  })

  it('should focus Cancel when the delete confirmation opens', () => {
    renderMenu({})

    openActions('Business')
    fireEvent.click(screen.getByRole('menuitem', { name: 'Delete subject' }))

    expect(document.activeElement).toBe(screen.getByTestId('subject-menu-cancel-delete-sub-business'))
  })

  it('should return focus to the first action when the delete is cancelled', () => {
    const { onDelete } = renderMenu({})

    openActions('Business')
    fireEvent.click(screen.getByRole('menuitem', { name: 'Delete subject' }))
    fireEvent.click(screen.getByTestId('subject-menu-cancel-delete-sub-business'))

    expect(onDelete).not.toHaveBeenCalled()
    expect(document.activeElement).toBe(screen.getByRole('menuitem', { name: 'Open' }))
  })

  it('should keep focus in the menu and show the error when the delete fails', async () => {
    renderMenu({ onDelete: vi.fn(async () => false) })

    openActions('Business')
    fireEvent.click(screen.getByRole('menuitem', { name: 'Delete subject' }))
    fireEvent.click(screen.getByTestId('subject-menu-confirm-delete-sub-business'))

    expect(await screen.findByRole('alert')).toBeTruthy()
    await waitFor(() => {
      expect(document.activeElement).toBe(screen.getByTestId('subject-menu-cancel-delete-sub-business'))
    })
  })

  it('should move focus to the page heading after the subject is deleted', async () => {
    renderMenu({ withHeading: true })

    openActions('Business')
    fireEvent.click(screen.getByRole('menuitem', { name: 'Delete subject' }))
    fireEvent.click(screen.getByTestId('subject-menu-confirm-delete-sub-business'))

    await waitFor(() => {
      expect(document.activeElement).toBe(screen.getByRole('heading', { name: 'Post Anki' }))
    })
  })
})

describe('SubjectRowMenu move picker', () => {
  it('should mark the current parent, disable it, and indent the nested options', () => {
    renderMenu({ subject: SALES })

    openActions('Sales')
    fireEvent.click(screen.getByRole('menuitem', { name: 'Move under…' }))

    const current = screen.getByTestId('subject-menu-move-target-sub-business')

    expect(current.textContent).toBe('Business (current)')
    expect(current.hasAttribute('disabled')).toBe(true)
    expect(screen.getByTestId('subject-menu-move-target-sub-health').textContent).toBe('Health')
  })

  it('should show a filter field and keep focus on it when there are more than eight options', () => {
    const many = Array.from({ length: 9 }, (_, index) => subject(`extra-${index}`, `Extra ${index}`, null))

    renderMenu({ subject: SALES, allSubjects: [BUSINESS, SALES, ...many] })

    openActions('Sales')
    fireEvent.click(screen.getByRole('menuitem', { name: 'Move under…' }))

    expect(document.activeElement).toBe(screen.getByLabelText('Filter subjects'))
  })

  it('should focus the first destination when the picker opens with few options', () => {
    renderMenu({ subject: SALES })

    openActions('Sales')
    fireEvent.click(screen.getByRole('menuitem', { name: 'Move under…' }))

    expect(document.activeElement).toBe(screen.getByTestId('subject-menu-move-top-sub-sales'))
  })

  it('should keep the picker open with focus inside it when the move fails', async () => {
    renderMenu({ subject: SALES, onMoveSubject: vi.fn(async () => false) })

    openActions('Sales')
    fireEvent.click(screen.getByRole('menuitem', { name: 'Move under…' }))
    fireEvent.click(screen.getByTestId('subject-menu-move-target-sub-health'))

    expect(await screen.findByRole('alert')).toBeTruthy()
    await waitFor(() => {
      expect(document.activeElement).toBe(screen.getByTestId('subject-menu-move-top-sub-sales'))
    })
  })
})

describe('SubjectRowMenu move targets', () => {
  it('should offer every other subject and Top level, but never the subject itself or its descendants', () => {
    renderMenu({ subject: BUSINESS, allSubjects: [BUSINESS, SALES, HEALTH, FITNESS] })

    fireEvent.click(screen.getByRole('button', { name: 'Actions for Business' }))
    fireEvent.click(screen.getByRole('menuitem', { name: 'Move under…' }))

    const labels = within(screen.getByRole('dialog', { name: 'Actions for Business' }))
      .getAllByRole('button')
      .map((item) => item.textContent)

    expect(labels).toEqual(['Top level (current)', 'Health', 'Fitness', 'Cancel'])
  })

  it('should move a subject under the chosen target', async () => {
    const { onMoveSubject } = renderMenu({ subject: SALES, allSubjects: [BUSINESS, SALES, HEALTH, FITNESS] })

    fireEvent.click(screen.getByRole('button', { name: 'Actions for Sales' }))
    fireEvent.click(screen.getByRole('menuitem', { name: 'Move under…' }))
    fireEvent.click(screen.getByTestId('subject-menu-move-target-sub-health'))

    await waitFor(() => {
      expect(onMoveSubject).toHaveBeenCalledWith('sub-sales', 'sub-health')
    })
  })

  it('should clear the parent when Top level is chosen', async () => {
    const { onMoveSubject } = renderMenu({ subject: SALES, allSubjects: [BUSINESS, SALES, HEALTH, FITNESS] })

    fireEvent.click(screen.getByRole('button', { name: 'Actions for Sales' }))
    fireEvent.click(screen.getByRole('menuitem', { name: 'Move under…' }))
    fireEvent.click(screen.getByTestId('subject-menu-move-top-sub-sales'))

    await waitFor(() => {
      expect(onMoveSubject).toHaveBeenCalledWith('sub-sales', null)
    })
  })
})
