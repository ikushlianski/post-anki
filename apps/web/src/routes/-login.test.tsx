// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import type { ReactNode } from 'react'

const search = vi.hoisted(() => ({ current: {} as { expired?: boolean } }))

vi.mock('@tanstack/react-router', () => ({
  createFileRoute: () => (config: { component: () => ReactNode }) => ({
    useSearch: () => search.current,
    component: config.component,
  }),
}))

vi.mock('../web-auth/web-auth.browser')

import { Route } from './login'

const Page = (Route as unknown as { component: () => ReactNode }).component

afterEach(() => {
  cleanup()
  search.current = {}
})

describe('LoginPage', () => {
  it('should show the product name so a visitor knows which app they are signing in to', () => {
    render(<Page />)

    expect(screen.getByTestId('login-product-name').textContent).toBe('PostAnki')
    expect(screen.getByRole('button', { name: 'Sign in' })).toBeTruthy()
  })

  it('should tell the user their session expired when sent back to sign in', () => {
    search.current = { expired: true }
    render(<Page />)

    expect(screen.getByTestId('login-session-expired')).toBeTruthy()
  })
})
