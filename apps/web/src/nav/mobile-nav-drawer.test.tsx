// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'

const router = vi.hoisted(() => ({ pathname: '/' }))

vi.mock('@tanstack/react-router', () => ({
  useRouterState: ({ select }: { select: (state: { location: { pathname: string } }) => string }) =>
    select({ location: { pathname: router.pathname } }),
}))

vi.mock('./sidebar', () => ({ Sidebar: () => <nav>menu</nav> }))

import { MobileNavDrawer } from './mobile-nav-drawer'

afterEach(() => {
  cleanup()
  router.pathname = '/'
})

describe('MobileNavDrawer', () => {
  it('should be a modal dialog named Navigation with a Close button', () => {
    const onClose = vi.fn()

    render(<MobileNavDrawer open onClose={onClose} />)
    onClose.mockClear()

    expect(screen.getByRole('dialog', { name: 'Navigation' }).getAttribute('aria-modal')).toBe('true')

    fireEvent.click(screen.getByRole('button', { name: 'Close' }))

    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('should close on Escape', () => {
    const onClose = vi.fn()

    render(<MobileNavDrawer open onClose={onClose} />)
    onClose.mockClear()
    fireEvent.keyDown(document, { key: 'Escape' })

    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('should close when the page changes', () => {
    const onClose = vi.fn()
    const { rerender } = render(<MobileNavDrawer open onClose={onClose} />)

    onClose.mockClear()
    router.pathname = '/stats'
    rerender(<MobileNavDrawer open onClose={onClose} />)

    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('should render nothing while closed', () => {
    render(<MobileNavDrawer open={false} onClose={vi.fn()} />)

    expect(screen.queryByRole('dialog')).toBeNull()
  })
})
