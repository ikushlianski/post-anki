// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'

import type { Subject } from '../curriculum/model'
import { SubjectHeaderMenu } from './subject-header-menu'
import { deleteSubject, updateSubjectName } from './subject.api'

const router = vi.hoisted(() => ({ invalidate: vi.fn(async () => undefined), navigate: vi.fn(async () => undefined) }))

vi.mock('@tanstack/react-router', () => ({
  useRouter: () => router,
}))

vi.mock('./subject.api', () => ({
  updateSubjectName: vi.fn(async () => null),
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

  it('should close the menu and return focus to the ⋯ button when Escape is pressed', () => {
    renderHeaderMenu()

    fireEvent.click(trigger())
    fireEvent.keyDown(screen.getByRole('menu', { name: 'Actions for Business' }), { key: 'Escape' })

    expect(screen.queryByRole('menu')).toBeNull()
    expect(trigger().getAttribute('aria-expanded')).toBe('false')
    expect(document.activeElement).toBe(trigger())
  })
})
