// @vitest-environment jsdom
import { useState } from 'react'
import { afterEach, describe, expect, it } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

import { ChatQueueShortcutsHelp } from './chat-queue-shortcuts-help'
import { CHAT_QUEUE_SHORTCUTS } from './chat-queue-shortcuts'

function Harness() {
  const [open, setOpen] = useState(false)

  return <ChatQueueShortcutsHelp open={open} onOpenChange={setOpen} />
}

function setup() {
  render(
    <div>
      <button type="button">Row</button>
      <input aria-label="Search" />
      <textarea aria-label="Message" />
      <Harness />
    </div>,
  )
}

describe('ChatQueueShortcutsHelp', () => {
  afterEach(cleanup)

  it('should open a labelled modal dialog listing every shortcut when the user presses ?', async () => {
    const user = userEvent.setup()
    setup()

    await user.keyboard('?')

    const dialog = screen.getByRole('dialog', { name: 'Keyboard shortcuts' })

    expect(dialog.getAttribute('aria-modal')).toBe('true')

    for (const shortcut of CHAT_QUEUE_SHORTCUTS) {
      expect(screen.getByText(shortcut.action)).toBeTruthy()
    }
  })

  it('should not open while the user is typing in the search box or message box', async () => {
    const user = userEvent.setup()
    setup()

    await user.click(screen.getByLabelText('Search'))
    await user.keyboard('?')
    await user.click(screen.getByLabelText('Message'))
    await user.keyboard('?')

    expect(screen.queryByRole('dialog')).toBeNull()
  })

  it('should move focus to Close on open and close with Escape, restoring focus to the previous element', async () => {
    const user = userEvent.setup()
    setup()

    const row = screen.getByRole('button', { name: 'Row' })

    row.focus()
    await user.keyboard('?')

    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Close' }))

    await user.keyboard('{Escape}')

    expect(screen.queryByRole('dialog')).toBeNull()
    expect(document.activeElement).toBe(row)
  })

  it('should close with the Close button and restore focus', async () => {
    const user = userEvent.setup()
    setup()

    const row = screen.getByRole('button', { name: 'Row' })

    row.focus()
    await user.keyboard('?')
    await user.click(screen.getByRole('button', { name: 'Close' }))

    expect(screen.queryByRole('dialog')).toBeNull()
    expect(document.activeElement).toBe(row)
  })

  it('should keep focus on Close when the user presses Tab or Shift+Tab', async () => {
    const user = userEvent.setup()
    setup()

    await user.keyboard('?')
    await user.tab()

    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Close' }))

    await user.tab({ shift: true })

    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Close' }))
  })
})
