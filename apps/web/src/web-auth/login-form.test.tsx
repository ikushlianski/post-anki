// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'

vi.mock('./web-auth.browser')

import { LoginForm } from './login-form'
import { signInWithPassword } from './web-auth.browser'

afterEach(() => {
  cleanup()
  vi.resetAllMocks()
})

function submitPassword(email: string, password: string) {
  render(<LoginForm />)
  fireEvent.change(screen.getByLabelText('Email'), { target: { value: email } })
  fireEvent.change(screen.getByLabelText('Password'), { target: { value: password } })
  fireEvent.click(screen.getByRole('button', { name: 'Sign in with password' }))
}

describe('LoginForm password sign-in', () => {
  it('should offer only email and password', () => {
    render(<LoginForm />)

    expect(screen.queryByLabelText('Device key')).toBeNull()
    expect(screen.queryByRole('button', { name: /email link|key/i })).toBeNull()
    expect(screen.getByLabelText('Password')).toBeTruthy()
  })

  it('should use password-manager friendly fields', () => {
    render(<LoginForm />)
  
    expect(screen.getByLabelText('Email').getAttribute('autocomplete')).toBe('username')
    expect(screen.getByLabelText('Password').getAttribute('type')).toBe('password')
    expect(screen.getByLabelText('Password').getAttribute('autocomplete')).toBe('current-password')
  })

  it('should send the pair, then clear the password but keep the email', async () => {
    vi.mocked(signInWithPassword).mockResolvedValue('failed')

    submitPassword('me@example.com', 'a-long-password')

    await waitFor(() =>
      expect(signInWithPassword).toHaveBeenCalledWith('me@example.com', 'a-long-password'),
    )
    expect((await screen.findByTestId('login-error')).textContent).toBe('Could not sign in.')
    expect((screen.getByLabelText('Password') as HTMLInputElement).value).toBe('')
    expect((screen.getByLabelText('Email') as HTMLInputElement).value).toBe('me@example.com')
  })

  it('should say too many attempts when the password is rate limited', async () => {
    vi.mocked(signInWithPassword).mockResolvedValue('rate_limited')

    submitPassword('me@example.com', 'x')

    expect((await screen.findByTestId('login-error')).textContent).toContain('Too many attempts')
  })
})
