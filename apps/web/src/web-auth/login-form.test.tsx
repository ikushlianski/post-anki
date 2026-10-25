// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'

vi.mock('./web-auth.browser')

import { LoginForm } from './login-form'
import { requestMagicLink } from './web-auth.browser'

afterEach(cleanup)

async function submit(email: string) {
  render(<LoginForm />)
  fireEvent.change(screen.getByLabelText('Email'), { target: { value: email } })
  fireEvent.click(screen.getByRole('button', { name: /sign-in link/i }))
}

describe('LoginForm', () => {
  it('should show the same inbox message whichever email was typed', async () => {
    vi.mocked(requestMagicLink).mockResolvedValue('sent')

    await submit('owner@example.com')

    const known = (await screen.findByTestId('login-sent')).textContent

    cleanup()
    await submit('stranger@example.com')

    expect((await screen.findByTestId('login-sent')).textContent).toBe(known)
    expect(known).toContain('Check your inbox')
  })

  it('should tell the visitor to try again later when rate limited', async () => {
    vi.mocked(requestMagicLink).mockResolvedValue('rate_limited')

    await submit('owner@example.com')

    await waitFor(() => {
      expect(screen.getByTestId('login-error').textContent).toContain('try again later')
    })
  })

  it('should explain a bad or expired link', () => {
    render(<LoginForm linkError />)

    expect(screen.getByTestId('login-link-error').textContent).toContain('invalid or has expired')
  })
})
