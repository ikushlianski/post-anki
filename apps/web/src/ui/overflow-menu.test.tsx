// @vitest-environment jsdom
import { createRef, useState } from 'react'
import { afterEach, describe, expect, it } from 'vitest'
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'

import { OverflowMenu, type OverflowMenuHandle } from './overflow-menu'

function Harness({ menuRef }: { menuRef: React.RefObject<OverflowMenuHandle | null> }) {
  const [open, setOpen] = useState(false)
  const [view, setView] = useState<'first' | 'second'>('first')

  return (
    <OverflowMenu
      ref={menuRef}
      label="Actions"
      testId="menu-trigger"
      open={open}
      viewKey={view}
      onOpenChange={setOpen}
      panelRole={view === 'first' ? 'menu' : 'dialog'}
    >
      {view === 'first' ? (
        <button type="button" role="menuitem" onClick={() => setView('second')}>
          Go
        </button>
      ) : (
        <>
          <input aria-label="Name" />
          <button type="button" onClick={() => setView('first')}>
            Back
          </button>
        </>
      )}
    </OverflowMenu>
  )
}

function renderHarness() {
  const menuRef = createRef<OverflowMenuHandle>()

  render(<Harness menuRef={menuRef} />)

  return { menuRef, trigger: screen.getByTestId('menu-trigger') }
}

afterEach(() => {
  cleanup()
})

describe('OverflowMenu', () => {
  it('should move focus to the first control of a view when the view changes', () => {
    const { trigger } = renderHarness()

    fireEvent.click(trigger)
    fireEvent.click(screen.getByRole('menuitem', { name: 'Go' }))

    expect(document.activeElement).toBe(screen.getByRole('textbox', { name: 'Name' }))
  })

  it('should keep focus inside the panel when the view is changed back to the first one', () => {
    const { trigger } = renderHarness()

    fireEvent.click(trigger)
    fireEvent.click(screen.getByRole('menuitem', { name: 'Go' }))
    fireEvent.click(screen.getByRole('button', { name: 'Back' }))

    expect(document.activeElement).toBe(screen.getByRole('menuitem', { name: 'Go' }))
  })

  it('should focus the first control again when the handle asks for it after a failed action', () => {
    const { menuRef, trigger } = renderHarness()

    fireEvent.click(trigger)
    fireEvent.click(screen.getByRole('menuitem', { name: 'Go' }))
    act(() => {
      screen.getByRole('button', { name: 'Back' }).blur()
      menuRef.current?.focusFirstControl()
    })

    expect(document.activeElement).toBe(screen.getByRole('textbox', { name: 'Name' }))
  })

  it('should close and return focus to the trigger when Escape is pressed in a later view', () => {
    const { trigger } = renderHarness()

    fireEvent.click(trigger)
    fireEvent.click(screen.getByRole('menuitem', { name: 'Go' }))
    fireEvent.keyDown(screen.getByRole('dialog', { name: 'Actions' }), { key: 'Escape' })

    expect(screen.queryByRole('dialog', { name: 'Actions' })).toBeNull()
    expect(document.activeElement).toBe(trigger)
  })

  it('should expose a non-menu panel as a dialog when the view is not an action list', () => {
    const { trigger } = renderHarness()

    fireEvent.click(trigger)
    fireEvent.click(screen.getByRole('menuitem', { name: 'Go' }))

    expect(screen.getByRole('dialog', { name: 'Actions' })).toBeTruthy()
    expect(screen.queryByRole('menu')).toBeNull()
  })
})
