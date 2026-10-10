// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'

import type { Subject } from '../curriculum/model'
import { SubjectHeaderMenu } from './subject-header-menu'
import { createSubject, deleteSubject, updateSubjectName, updateSubjectParent } from './subject.api'

const live = vi.hoisted(() => ({ curriculumCount: 0 as number | null, subjects: null as Subject[] | null }))

vi.mock('./subject-live-data', () => ({
  useLiveCurriculumCount: () => live.curriculumCount,
  useLiveSubjects: () => live.subjects,
}))

const router = vi.hoisted(() => ({ invalidate: vi.fn(async () => undefined), navigate: vi.fn(async () => undefined) }))

vi.mock('@tanstack/react-router', () => ({
  useRouter: () => router,
}))

vi.mock('./subject.api', () => ({
  createSubject: vi.fn(async () => null),
  updateSubjectName: vi.fn(async () => null),
  updateSubjectParent: vi.fn(async () => null),
  deleteSubject: vi.fn(async () => null),
}))

const SUBJECT: Subject = {
  id: 'sub_business',
  name: 'Business',
  kind: 'architecture-mentor',
  requireSources: false,
  modelTier: null,
  parentId: null,
}

function trigger() {
  return screen.getByRole('button', { name: 'Actions for Business' })
}

function renderHeaderMenu() {
  render(<SubjectHeaderMenu subject={SUBJECT} />)
}

afterEach(() => {
  cleanup()
  live.curriculumCount = 0
  live.subjects = null
  vi.clearAllMocks()
})

describe('SubjectHeaderMenu', () => {
  it('should open a menu with Rename and Delete subject when the ⋯ button is pressed', () => {
    renderHeaderMenu()

    expect(trigger().getAttribute('aria-expanded')).toBe('false')
    expect(trigger().getAttribute('aria-haspopup')).toBe('menu')

    fireEvent.click(trigger())

    expect(trigger().getAttribute('aria-expanded')).toBe('true')
    expect(screen.getByRole('menu', { name: 'Actions for Business' })).toBeTruthy()
    expect(screen.getAllByRole('menuitem').map((item) => item.textContent)).toEqual([
      'Add sub-subject',
      'Move under…',
      'Rename',
      'Delete subject',
    ])
  })

  it('should save the trimmed new name through updateSubjectName and refresh the page', async () => {
    renderHeaderMenu()

    fireEvent.click(trigger())
    fireEvent.click(screen.getByRole('menuitem', { name: 'Rename' }))
    fireEvent.change(screen.getByTestId('subject-rename-sub_business-input'), {
      target: { value: '  Business strategy  ' },
    })
    fireEvent.click(screen.getByTestId('subject-rename-sub_business-confirm'))

    await waitFor(() => {
      expect(vi.mocked(updateSubjectName)).toHaveBeenCalledWith({
        data: { subjectId: 'sub_business', name: 'Business strategy' },
      })
    })
    await waitFor(() => {
      expect(router.invalidate).toHaveBeenCalled()
    })
    await waitFor(() => {
      expect(screen.queryByRole('menu')).toBeNull()
    })
  })

  it('should keep the rename field open with an error when the save fails', async () => {
    vi.mocked(updateSubjectName).mockRejectedValueOnce(new Error('boom'))
    renderHeaderMenu()

    fireEvent.click(trigger())
    fireEvent.click(screen.getByRole('menuitem', { name: 'Rename' }))
    fireEvent.change(screen.getByTestId('subject-rename-sub_business-input'), {
      target: { value: 'Finance' },
    })
    fireEvent.click(screen.getByTestId('subject-rename-sub_business-confirm'))

    expect((await screen.findByTestId('subject-rename-sub_business-error')).textContent).toContain(
      'Rename failed',
    )
    expect(screen.getByTestId('subject-rename-sub_business-input')).toBeTruthy()
  })

  it('should not call deleteSubject until the deletion is confirmed', () => {
    renderHeaderMenu()

    fireEvent.click(trigger())
    fireEvent.click(screen.getByRole('menuitem', { name: 'Delete subject' }))

    expect(screen.getByText('Delete Business?')).toBeTruthy()
    expect(vi.mocked(deleteSubject)).not.toHaveBeenCalled()
  })

  it('should say how many courses are deleted and how many sub-subjects move up, from live data', () => {
    live.curriculumCount = 3
    live.subjects = [
      SUBJECT,
      { ...SUBJECT, id: 'sub_sales', name: 'Sales', parentId: 'sub_business' },
    ]
    renderHeaderMenu()

    fireEvent.click(trigger())
    fireEvent.click(screen.getByRole('menuitem', { name: 'Delete subject' }))

    expect(screen.getByTestId('subject-delete-impact').textContent).toContain('3 courses will be deleted')
    expect(screen.getByTestId('subject-delete-impact').textContent).toContain(
      '1 sub-subject will move to the top level.',
    )
    expect(screen.getByTestId('delete-subject-confirm').textContent).toBe('Delete subject and 3 courses')
  })

  it('should call deleteSubject with the subject id once the deletion is confirmed', async () => {
    renderHeaderMenu()

    fireEvent.click(trigger())
    fireEvent.click(screen.getByRole('menuitem', { name: 'Delete subject' }))
    fireEvent.click(screen.getByTestId('delete-subject-confirm'))

    await waitFor(() => {
      expect(vi.mocked(deleteSubject)).toHaveBeenCalledWith({ data: 'sub_business' })
    })
    await waitFor(() => {
      expect(router.navigate).toHaveBeenCalledWith({ to: '/' })
    })
  })

  it('should create a sub-subject under this subject and refresh the page', async () => {
    renderHeaderMenu()

    fireEvent.click(trigger())
    fireEvent.click(screen.getByRole('menuitem', { name: 'Add sub-subject' }))
    fireEvent.change(screen.getByTestId('subject-header-add-child-input'), {
      target: { value: '  Marketing  ' },
    })
    fireEvent.click(screen.getByTestId('subject-header-add-child-submit'))

    await waitFor(() => {
      expect(vi.mocked(createSubject)).toHaveBeenCalledWith({
        data: { name: 'Marketing', kind: 'architecture-mentor', parentId: 'sub_business' },
      })
    })
    await waitFor(() => {
      expect(router.invalidate).toHaveBeenCalled()
    })
  })

  it('should move the subject under the chosen parent from the picker', async () => {
    live.subjects = [SUBJECT, { ...SUBJECT, id: 'sub_health', name: 'Health', parentId: null }]
    renderHeaderMenu()

    fireEvent.click(trigger())
    fireEvent.click(screen.getByRole('menuitem', { name: 'Move under…' }))
    fireEvent.click(screen.getByTestId('subject-header-move-target-sub_health'))

    await waitFor(() => {
      expect(vi.mocked(updateSubjectParent)).toHaveBeenCalledWith({
        data: { subjectId: 'sub_business', parentId: 'sub_health' },
      })
    })
  })

  it('should navigate to the dashboard once the subject is deleted', async () => {
    renderHeaderMenu()

    fireEvent.click(trigger())
    fireEvent.click(screen.getByRole('menuitem', { name: 'Delete subject' }))
    fireEvent.click(screen.getByTestId('delete-subject-confirm'))

    await waitFor(() => {
      expect(router.navigate).toHaveBeenCalledWith({ to: '/' })
    })
  })

  it('should close the menu and return focus to the ⋯ button when Escape is pressed', () => {
    renderHeaderMenu()

    fireEvent.click(trigger())
    fireEvent.keyDown(screen.getByRole('menu', { name: 'Actions for Business' }), { key: 'Escape' })

    expect(screen.queryByRole('menu')).toBeNull()
    expect(trigger().getAttribute('aria-expanded')).toBe('false')
    expect(document.activeElement).toBe(trigger())
  })
})
