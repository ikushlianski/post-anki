// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import type { NotionConnectionStatus } from '@post-anki/shared'

import {
  checkNotionConnection,
  getNotionConnection,
  removeNotionToken,
  saveNotionToken,
} from '../notion-source/notion-source.api'
import { NotionConnectionPanel } from './notion-connection-panel'

vi.mock('../notion-source/notion-source.api')
vi.mock('@tanstack/react-router', () => ({
  Link: ({ to, children, ...rest }: { to: string; children: React.ReactNode }) => (
    <a href={to} {...rest}>
      {children}
    </a>
  ),
}))

const none: NotionConnectionStatus = { configured: false, origin: 'none', canStoreToken: true }
const stored: NotionConnectionStatus = { configured: true, origin: 'settings', canStoreToken: true }

afterEach(() => {
  cleanup()
  vi.resetAllMocks()
})

async function renderPanel(status: NotionConnectionStatus) {
  vi.mocked(getNotionConnection).mockResolvedValue({ ok: true, data: status })
  render(<NotionConnectionPanel />)
  await screen.findByTestId('notion-connection-state')
}

describe('NotionConnectionPanel', () => {
  it('should show only connected or not connected and where the token comes from', async () => {
    await renderPanel({ configured: true, origin: 'env', canStoreToken: true })

    expect(screen.getByTestId('notion-connection-state').textContent).toBe(
      'Connected - The token comes from the server environment.',
    )
    expect(screen.queryByTestId('notion-connection-disconnect')).toBeNull()
  })

  it('should keep the token field a password input that starts empty', async () => {
    await renderPanel(stored)

    const input = screen.getByTestId('notion-connection-token') as HTMLInputElement

    expect(input.type).toBe('password')
    expect(input.value).toBe('')
  })

  it('should clear the token from the field and the page after it is saved', async () => {
    vi.mocked(saveNotionToken).mockResolvedValue({ ok: true, data: stored })
    await renderPanel(none)

    const input = screen.getByTestId('notion-connection-token') as HTMLInputElement

    fireEvent.change(input, { target: { value: 'secret_abc123' } })
    fireEvent.click(screen.getByTestId('notion-connection-save'))

    await waitFor(() => expect(input.value).toBe(''))
    expect(saveNotionToken).toHaveBeenCalledWith({ data: { token: 'secret_abc123' } })
    expect(await screen.findByText('Token saved.')).toBeTruthy()
    expect(document.body.innerHTML).not.toContain('secret_abc123')
  })

  it('should clear the token even when saving fails', async () => {
    vi.mocked(saveNotionToken).mockResolvedValue({ ok: false, status: 500, code: null })
    await renderPanel(none)

    const input = screen.getByTestId('notion-connection-token') as HTMLInputElement

    fireEvent.change(input, { target: { value: 'secret_abc123' } })
    fireEvent.click(screen.getByTestId('notion-connection-save'))

    await screen.findByTestId('notion-connection-message')
    expect(input.value).toBe('')
    expect(document.body.innerHTML).not.toContain('secret_abc123')
  })

  it('should explain in plain words that the server needs an encryption key', async () => {
    vi.mocked(saveNotionToken).mockResolvedValue({ ok: false, status: 409, code: 'secret_key_missing' })
    await renderPanel(none)

    fireEvent.change(screen.getByTestId('notion-connection-token'), { target: { value: 'secret_abc123' } })
    fireEvent.click(screen.getByTestId('notion-connection-save'))

    expect((await screen.findByTestId('notion-connection-message')).textContent).toContain(
      'CONNECTOR_SECRET_KEY',
    )
  })

  it('should block saving up front when the server cannot store a token', async () => {
    await renderPanel({ configured: false, origin: 'none', canStoreToken: false })

    fireEvent.change(screen.getByTestId('notion-connection-token'), { target: { value: 'x' } })

    expect(screen.getByTestId('notion-connection-no-key')).toBeTruthy()
    expect((screen.getByTestId('notion-connection-save') as HTMLButtonElement).disabled).toBe(true)
  })

  it('should report whether the connection works', async () => {
    vi.mocked(checkNotionConnection).mockResolvedValue({
      ok: true,
      data: { ok: true, workspaceName: 'My space', reason: null },
    })
    await renderPanel(stored)

    fireEvent.click(screen.getByTestId('notion-connection-check'))

    expect((await screen.findByTestId('notion-connection-message')).textContent).toContain('My space')
  })

  it('should disconnect a stored token and show not connected', async () => {
    vi.mocked(removeNotionToken).mockResolvedValue({ ok: true, data: none })
    await renderPanel(stored)

    fireEvent.click(screen.getByTestId('notion-connection-disconnect'))

    await waitFor(() =>
      expect(screen.getByTestId('notion-connection-state').textContent).toContain('Not connected'),
    )
  })

  it('should say the state could not be loaded instead of guessing', async () => {
    vi.mocked(getNotionConnection).mockResolvedValue({ ok: false, status: 500, code: null })
    render(<NotionConnectionPanel />)

    expect(await screen.findByTestId('notion-connection-load-error')).toBeTruthy()
  })

  it('should link the token setting to the Notion sources page', async () => {
    await renderPanel(none)

    expect(screen.getByTestId('notion-connection-sources-link').getAttribute('href')).toBe('/notion-sources')
  })
})
