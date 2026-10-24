// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import {
  Outlet,
  RouterProvider,
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
} from '@tanstack/react-router'

import { RouteLoadError } from './route-load-error'
import { RouteNotFound } from './route-not-found'
import { RoutePending } from './route-pending'

function buildRouter(path: string, loader: () => Promise<string>) {
  const rootRoute = createRootRoute({ component: Outlet })
  const indexRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: '/',
    loader,
    component: () => <div data-testid="dashboard">Post Anki</div>,
  })

  return createRouter({
    routeTree: rootRoute.addChildren([indexRoute]),
    history: createMemoryHistory({ initialEntries: [path] }),
    defaultErrorComponent: RouteLoadError,
    defaultNotFoundComponent: RouteNotFound,
    defaultPendingComponent: RoutePending,
  })
}

describe('router fallback pages', () => {
  afterEach(() => {
    cleanup()
    vi.restoreAllMocks()
  })

  it('should show a plain message without the raw error when the home loader fails', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    const router = buildRouter('/', () => Promise.reject(new Error('db password leaked')))

    render(<RouterProvider router={router} />)

    expect(await screen.findByTestId('route-load-error')).toBeTruthy()
    expect(screen.queryByText(/db password leaked/)).toBeNull()
    expect(screen.getByTestId('route-load-error-home').getAttribute('href')).toBe('/')
  })

  it('should reload the page data through the router when the learner presses Retry', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    const loader = vi
      .fn<() => Promise<string>>()
      .mockRejectedValueOnce(new Error('api down'))
      .mockResolvedValue('ok')
    const router = buildRouter('/', loader)
    const invalidate = vi.spyOn(router, 'invalidate')

    render(<RouterProvider router={router} />)
    fireEvent.click(await screen.findByTestId('route-load-error-retry'))

    expect(await screen.findByTestId('dashboard')).toBeTruthy()
    expect(invalidate).toHaveBeenCalled()
    await waitFor(() => expect(loader).toHaveBeenCalledTimes(2))
  })

  it('should show the not-found page with a way home for an unknown address', async () => {
    const router = buildRouter('/no-such-page', () => Promise.resolve('ok'))

    render(<RouterProvider router={router} />)

    expect(await screen.findByTestId('route-not-found')).toBeTruthy()
    expect(screen.getByTestId('route-not-found-home').getAttribute('href')).toBe('/')
  })

  it('should announce loading while a slow page is fetched', () => {
    render(<RoutePending />)

    expect(screen.getByRole('status').textContent).toContain('Loading')
  })
})
