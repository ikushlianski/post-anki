// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

import { KnowledgeOverviewDeleteDialog } from './knowledge-overview-delete-dialog'

function renderDialog(overrides: Partial<Parameters<typeof KnowledgeOverviewDeleteDialog>[0]> = {}) {
  const onConfirm = vi.fn()
  const onCancel = vi.fn()

  render(
    <KnowledgeOverviewDeleteDialog count={3} busy={false} error={null} onConfirm={onConfirm} onCancel={onCancel} {...overrides} />,
  )

  return { onConfirm, onCancel }
}

afterEach(() => {
  cleanup()
})

describe('KnowledgeOverviewDeleteDialog', () => {
  it('should be a modal alert dialog titled with the number of cards', () => {
    renderDialog()

    const dialog = screen.getByRole('alertdialog', { name: 'Delete 3 cards permanently?' })

    expect(dialog.getAttribute('aria-modal')).toBe('true')
  })

  it('should put initial focus on Delete so Enter confirms', async () => {
    const { onConfirm } = renderDialog()

    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Delete' }))

    await userEvent.keyboard('{Enter}')

    expect(onConfirm).toHaveBeenCalledTimes(1)
  })

  it('should cancel on Escape without deleting', async () => {
    const { onConfirm, onCancel } = renderDialog()

    await userEvent.keyboard('{Escape}')

    expect(onCancel).toHaveBeenCalledTimes(1)
    expect(onConfirm).not.toHaveBeenCalled()
  })

  it('should keep Tab inside the dialog in both directions', async () => {
    renderDialog()

    const cancel = screen.getByRole('button', { name: 'Cancel' })
    const confirm = screen.getByRole('button', { name: 'Delete' })

    await userEvent.tab()
    expect(document.activeElement).toBe(cancel)

    await userEvent.tab({ shift: true })
    expect(document.activeElement).toBe(confirm)
  })

  it('should not confirm again for a held-down Enter', () => {
    const { onConfirm } = renderDialog()
    const confirm = screen.getByRole('button', { name: 'Delete' })
    const notPrevented = fireEvent.keyDown(confirm, { key: 'Enter', repeat: true })

    expect(notPrevented).toBe(false)
    expect(onConfirm).not.toHaveBeenCalled()
  })

  it('should ignore Delete clicks while a delete is already running', async () => {
    const { onConfirm } = renderDialog({ busy: true })

    await userEvent.click(screen.getByRole('button', { name: 'Deleting…' }))

    expect(onConfirm).not.toHaveBeenCalled()
  })

  it('should say a single card in the singular and show a failure', () => {
    renderDialog({ count: 1, error: 'Could not delete the cards. Nothing was removed.' })

    expect(screen.getByRole('alertdialog', { name: 'Delete 1 card permanently?' })).toBeTruthy()
    expect(screen.getByRole('alert').textContent).toContain('Nothing was removed')
  })
})
