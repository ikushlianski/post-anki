// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import type { Account } from '@post-anki/shared'
import { AccountSection } from './account-section'

afterEach(cleanup)

const account: Account = { email: 'ann@example.com', name: 'Ann', lastSignInAt: '2026-02-01T10:00:00.000Z' }

function setup(onSaveName = vi.fn().mockResolvedValue({ ...account, name: 'Anna' })) {
  render(<AccountSection account={account} onSaveName={onSaveName} />)

  return { onSaveName, input: screen.getByTestId('account-name-input') as HTMLInputElement }
}

describe('AccountSection', () => {
  it('should show the email as plain text the learner cannot edit', () => {
    setup()

    expect(screen.getByTestId('account-email').textContent).toBe('ann@example.com')
    expect(screen.getByTestId('account-email').tagName).not.toBe('INPUT')
  })

  it('should show a last sign-in date', () => {
    setup()

    expect(screen.getByTestId('account-last-sign-in').textContent).not.toBe('Unknown')
  })

  it('should save the trimmed name and confirm it', async () => {
    const { input, onSaveName } = setup()

    fireEvent.change(input, { target: { value: '  Anna ' } })
    fireEvent.click(screen.getByTestId('account-name-save'))

    await waitFor(() => expect(screen.getByTestId('account-name-feedback').textContent).toBe('Saved.'))
    expect(onSaveName).toHaveBeenCalledWith('Anna')
  })

  it('should refuse an empty name without calling the server', async () => {
    const { input, onSaveName } = setup()

    fireEvent.change(input, { target: { value: '   ' } })
    fireEvent.submit(input.closest('form') as HTMLFormElement)

    await waitFor(() => expect(screen.getByRole('alert')).toBeTruthy())
    expect(onSaveName).not.toHaveBeenCalled()
  })

  it('should tell the learner when saving fails', async () => {
    const { input } = setup(vi.fn().mockRejectedValue(new Error('down')))

    fireEvent.change(input, { target: { value: 'Anna' } })
    fireEvent.click(screen.getByTestId('account-name-save'))

    await waitFor(() => expect(screen.getByRole('alert').textContent).toContain("Couldn't save"))
  })
})
