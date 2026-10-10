// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import type { ReactNode } from 'react'

import type { Subject } from '../curriculum/model'
import { SubjectRowMenu } from './subject-row-menu'

vi.mock('@tanstack/react-router', () => ({
  Link: ({
    to,
    params,
    children,
    ...rest
  }: {
    to: string
    params: Record<string, string>
    children: ReactNode
    role?: string
    'data-testid'?: string
  }) => (
    <a href={`${to}?${JSON.stringify(params)}`} {...rest}>
      {children}
    </a>
  ),
}))

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
})

const SUBJECT: Subject = {
  id: 'subject-business',
  name: 'Business',
  kind: 'architecture-mentor',
  requireSources: false,
  modelTier: null,
}

function renderMenu(overrides: Partial<{
  onRename: (subjectId: string, name: string) => Promise<boolean>
  onDelete: (subjectId: string) => Promise<boolean>
}> = {}) {
  const onRename = overrides.onRename ?? vi.fn(async () => true)
  const onDelete = overrides.onDelete ?? vi.fn(async () => true)

  render(<SubjectRowMenu subject={SUBJECT} onRename={onRename} onDelete={onDelete} />)

  return { onRename, onDelete }
}

function trigger() {
  return screen.getByRole('button', { name: 'Actions for Business' })
}

describe('SubjectRowMenu', () => {
  it('should open a menu of subject actions when the ⋯ button is pressed', () => {
    renderMenu()

    expect(trigger().getAttribute('aria-expanded')).toBe('false')
    expect(trigger().getAttribute('aria-haspopup')).toBe('menu')

    fireEvent.click(trigger())

    expect(trigger().getAttribute('aria-expanded')).toBe('true')
    expect(screen.getByRole('menu', { name: 'Actions for Business' })).toBeTruthy()
    expect(screen.getAllByRole('menuitem').map((item) => item.textContent)).toEqual([
      'Open',
      'Rename',
      'Delete subject',
    ])
  })

  it('should link Open to the subject page', () => {
    renderMenu()

    fireEvent.click(trigger())

    const openItem = screen.getByRole('menuitem', { name: 'Open' })

    expect(openItem.getAttribute('href')).toContain('/subject/$subjectId')
    expect(openItem.getAttribute('href')).toContain('"subjectId":"subject-business"')
  })

  it('should call onRename with the trimmed new name when the rename form is saved', async () => {
    const { onRename } = renderMenu()

    fireEvent.click(trigger())
    fireEvent.click(screen.getByRole('menuitem', { name: 'Rename' }))

    const input = screen.getByRole('textbox', { name: 'Subject name' })

    fireEvent.change(input, { target: { value: '  Business strategy  ' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save name' }))

    await waitFor(() => {
      expect(onRename).toHaveBeenCalledWith('subject-business', 'Business strategy')
    })
    await waitFor(() => {
      expect(screen.queryByRole('menu')).toBeNull()
    })
  })

  it('should keep the rename form open and show an error when the rename fails', async () => {
    renderMenu({ onRename: vi.fn(async () => false) })

    fireEvent.click(trigger())
    fireEvent.click(screen.getByRole('menuitem', { name: 'Rename' }))
    fireEvent.change(screen.getByRole('textbox', { name: 'Subject name' }), {
      target: { value: 'Finance' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Save name' }))

    expect(await screen.findByRole('alert')).toBeTruthy()
    expect(screen.getByRole('textbox', { name: 'Subject name' })).toBeTruthy()
  })

  it('should not call onDelete until the delete is confirmed', () => {
    const { onDelete } = renderMenu()

    fireEvent.click(trigger())
    fireEvent.click(screen.getByRole('menuitem', { name: 'Delete subject' }))

    expect(onDelete).not.toHaveBeenCalled()
  })

  it('should call onDelete with the subject id once the delete is confirmed', async () => {
    const { onDelete } = renderMenu()

    fireEvent.click(trigger())
    fireEvent.click(screen.getByRole('menuitem', { name: 'Delete subject' }))
    fireEvent.click(screen.getByRole('button', { name: 'Delete' }))

    await waitFor(() => {
      expect(onDelete).toHaveBeenCalledWith('subject-business')
    })
  })

  it('should close the menu and return focus to the ⋯ button when Escape is pressed', () => {
    renderMenu()

    fireEvent.click(trigger())

    const menu = screen.getByRole('menu', { name: 'Actions for Business' })

    fireEvent.keyDown(menu, { key: 'Escape' })

    expect(screen.queryByRole('menu')).toBeNull()
    expect(trigger().getAttribute('aria-expanded')).toBe('false')
    expect(document.activeElement).toBe(trigger())
  })

  it('should move focus between actions with the arrow keys', () => {
    renderMenu()

    fireEvent.click(trigger())

    const [open, rename, deleteItem] = screen.getAllByRole('menuitem')

    expect(document.activeElement).toBe(open)

    fireEvent.keyDown(screen.getByRole('menu'), { key: 'ArrowDown' })
    expect(document.activeElement).toBe(rename)

    fireEvent.keyDown(screen.getByRole('menu'), { key: 'End' })
    expect(document.activeElement).toBe(deleteItem)

    fireEvent.keyDown(screen.getByRole('menu'), { key: 'ArrowDown' })
    expect(document.activeElement).toBe(open)

    fireEvent.keyDown(screen.getByRole('menu'), { key: 'ArrowUp' })
    expect(document.activeElement).toBe(deleteItem)
  })

  it('should show the ⋯ button without requiring hover or focus', () => {
    renderMenu()

    expect(trigger().className).not.toContain('opacity-0')
  })

  it('should not let the ⋯ click reach the card link and should prevent its default action', () => {
    const onCardClick = vi.fn()

    render(
      <div onClick={onCardClick}>
        <SubjectRowMenu subject={SUBJECT} onRename={vi.fn(async () => true)} onDelete={vi.fn(async () => true)} />
      </div>,
    )

    const notPrevented = fireEvent.click(trigger())

    expect(onCardClick).not.toHaveBeenCalled()
    expect(notPrevented).toBe(false)
  })

  it('should close the menu when the pointer is pressed outside it', () => {
    renderMenu()

    fireEvent.click(trigger())
    fireEvent.mouseDown(document.body)

    expect(screen.queryByRole('menu')).toBeNull()
  })
})
