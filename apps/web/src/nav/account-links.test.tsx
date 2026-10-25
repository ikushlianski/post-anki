// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import type { ReactNode } from 'react'

vi.mock('@tanstack/react-router', () => ({
  Link: ({ children, to, ...rest }: { children: ReactNode; to?: string } & Record<string, unknown>) => (
    <a href="#" data-to={to} {...rest}>
      {children}
    </a>
  ),
}))

vi.mock('../web-auth/web-auth.browser', () => ({ signOut: vi.fn(async () => true) }))

import { signOut } from '../web-auth/web-auth.browser'
import { AccountLinks } from './account-links'

afterEach(() => {
  cleanup()
})

describe('AccountLinks', () => {
  it('should offer Profile and Sign out in the top bar', () => {
    render(<AccountLinks />)

    expect(screen.getByTestId('nav-profile').getAttribute('data-to')).toBe('/profile')
    expect(screen.getByTestId('nav-sign-out')).toBeTruthy()
  })

  it('should end the session when Sign out is pressed', () => {
    render(<AccountLinks />)
    fireEvent.click(screen.getByTestId('nav-sign-out'))

    expect(signOut).toHaveBeenCalledTimes(1)
  })
})
