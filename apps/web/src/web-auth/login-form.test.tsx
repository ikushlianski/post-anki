// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'

vi.mock('./web-auth.browser')

import { LoginForm } from './login-form'
import { requestMagicLink, signInWithKey, signInWithPassword } from './web-auth.browser'

afterEach(() => {
  cleanup()
  vi.resetAllMocks()
})

function chooseMethod(name: RegExp) {
  fireEvent.click(screen.getByRole('button', { name }))
}

function submitKey(key: string) {
  render(<LoginForm />)
  fireEvent.change(screen.getByLabelText('Device key'), { target: { value: key } })
  fireEvent.click(screen.getByRole('button', { name: 'Sign in with key' }))
}

function submitPassword(email: string, password: string) {
  render(<LoginForm />)
  chooseMethod(/email and password/i)
  fireEvent.change(screen.getByLabelText('Email'), { target: { value: email } })
  fireEvent.change(screen.getByLabelText('Password'), { target: { value: password } })
  fireEvent.click(screen.getByRole('button', { name: 'Sign in with password' }))
}

describe('LoginForm key sign-in', () => {
  it('should offer the key form first with a hidden, non-remembered field', () => {
    render(<LoginForm />)

    const field = screen.getByLabelText('Device key')

    expect(field.getAttribute('type')).toBe('password')
    expect(field.getAttribute('autocomplete')).toBe('off')
  })

  it('should send the typed key, clear the field and show nothing on success', async () => {
    vi.mocked(signInWithKey).mockResolvedValue('signed_in')

    submitKey('pat_abc')

    await waitFor(() => expect(signInWithKey).toHaveBeenCalledWith('pat_abc'))
    await waitFor(() => {
      expect((screen.getByLabelText('Device key') as HTMLInputElement).value).toBe('')
    })
    expect(screen.queryByTestId('login-error')).toBeNull()
  })

  it('should show one generic message for a failed key and clear the field', async () => {
    vi.mocked(signInWithKey).mockResolvedValue('failed')

    submitKey('pat_bad')

    expect((await screen.findByTestId('login-error')).textContent).toBe('Could not sign in.')
    expect((screen.getByLabelText('Device key') as HTMLInputElement).value).toBe('')
  })

  it('should say too many attempts when the key is rate limited', async () => {
    vi.mocked(signInWithKey).mockResolvedValue('rate_limited')

    submitKey('pat_bad')

    expect((await screen.findByTestId('login-error')).textContent).toContain('Too many attempts')
  })
})

describe('LoginForm password sign-in', () => {
  it('should use password-manager friendly fields', () => {
    render(<LoginForm />)
    chooseMethod(/email and password/i)

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

describe('LoginForm email link', () => {
  it('should hide the email link option when it is not available', () => {
    render(<LoginForm />)

    expect(screen.queryByRole('button', { name: /email link/i })).toBeNull()
  })

  it('should show the same inbox message whichever email was typed', async () => {
    vi.mocked(requestMagicLink).mockResolvedValue('sent')
    render(<LoginForm magicLinkAvailable />)
    chooseMethod(/email link/i)
    fireEvent.change(screen.getByLabelText('Email'), { target: { value: 'x@example.com' } })
    fireEvent.click(screen.getByRole('button', { name: /sign-in link/i }))

    expect((await screen.findByTestId('login-sent')).textContent).toContain('Check your inbox')
  })

  it('should explain a bad or expired link', () => {
    render(<LoginForm linkError />)

    expect(screen.getByTestId('login-link-error').textContent).toContain('invalid or has expired')
  })
})
