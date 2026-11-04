// @vitest-environment jsdom
import { useState } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

import { ShortcutsHelp } from '../shortcuts-help/shortcuts-help'
import { FOCUS_HANDLED_KEYS, useFocusKeyboard } from './knowledge-bit-focus-keyboard'
import { FOCUS_SHORTCUTS } from './knowledge-bit-focus-shortcuts'

const KEY_LABELS: Record<string, string> = {
  ArrowRight: '→',
  ArrowLeft: '←',
  ArrowUp: '↑',
  ArrowDown: '↓',
}

function Harness() {
  const [open, setOpen] = useState(false)

  return <ShortcutsHelp open={open} onOpenChange={setOpen} shortcuts={FOCUS_SHORTCUTS} />
}

describe('FOCUS_SHORTCUTS', () => {
  it('should list every key the triage view reacts to', () => {
    const listed = FOCUS_SHORTCUTS.flatMap((shortcut) => shortcut.keys.split(' / '))

    for (const key of FOCUS_HANDLED_KEYS) {
      expect(listed).toContain(KEY_LABELS[key] ?? key)
    }
  })
})

describe('triage shortcuts help', () => {
  afterEach(cleanup)

  it('should open on ? listing the triage shortcuts and close on Escape', async () => {
    const user = userEvent.setup()

    render(<Harness />)
    await user.keyboard('?')

    expect(screen.getByRole('dialog', { name: 'Keyboard shortcuts' })).toBeTruthy()

    for (const shortcut of FOCUS_SHORTCUTS) {
      expect(screen.getByText(shortcut.action)).toBeTruthy()
    }

    await user.keyboard('{Escape}')

    expect(screen.queryByRole('dialog')).toBeNull()
  })

  it('should ignore ? while the user types in a text box', async () => {
    const user = userEvent.setup()

    render(
      <div>
        <textarea aria-label="Message" />
        <Harness />
      </div>,
    )
    await user.click(screen.getByLabelText('Message'))
    await user.keyboard('?')

    expect(screen.queryByRole('dialog')).toBeNull()
  })
})

describe('triage keys behind the open help', () => {
  afterEach(cleanup)

  const keys = ['a', 'r', 'x', 'z', 'c', 'i', 'e']

  function Wired({ onAction }: { onAction: (action: string) => void }) {
    useFocusKeyboard(onAction, true)

    return <Harness />
  }

  it('should ignore every handled key while help is open and work again after closing', async () => {
    const user = userEvent.setup()
    const onAction = vi.fn()

    render(<Wired onAction={onAction} />)
    await user.keyboard('?')

    for (const key of keys) {
      await user.keyboard(key.length > 1 ? `{${key}}` : key)
    }

    expect(onAction).not.toHaveBeenCalled()

    await user.keyboard('{Escape}')
    await user.keyboard('a')

    expect(onAction).toHaveBeenCalledWith('approve')
  })

  it('should close the help when ? is pressed again', async () => {
    const user = userEvent.setup()

    render(<Wired onAction={vi.fn()} />)
    await user.keyboard('?')
    await user.keyboard('?')

    expect(screen.queryByRole('dialog')).toBeNull()
  })
})
