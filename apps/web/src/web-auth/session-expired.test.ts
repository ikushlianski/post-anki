import { describe, expect, it, vi } from 'vitest'

import { installSessionExpiredRedirect, SESSION_EXPIRED_PATH } from './session-expired'

function host(status: number, pathname = '/knowledge/review') {
  return {
    fetch: vi.fn(async () => new Response(null, { status })) as unknown as typeof fetch,
    location: { pathname, assign: vi.fn() },
  }
}

describe('installSessionExpiredRedirect', () => {
  it('should send the browser to the sign-in page once when a server call returns 401', async () => {
    const h = host(401)

    installSessionExpiredRedirect(h)
    await h.fetch('/_serverFn/abc')
    await h.fetch('/_serverFn/def')

    expect(h.location.assign).toHaveBeenCalledTimes(1)
    expect(h.location.assign).toHaveBeenCalledWith(SESSION_EXPIRED_PATH)
  })

  it('should not redirect when already on the login page', async () => {
    const h = host(401, '/login')

    installSessionExpiredRedirect(h)
    await h.fetch('/_serverFn/abc')

    expect(h.location.assign).not.toHaveBeenCalled()
  })

  it('should ignore a 401 from other URLs and other statuses', async () => {
    const other = host(401)
    const ok = host(200)

    installSessionExpiredRedirect(other)
    installSessionExpiredRedirect(ok)
    await other.fetch('/api/auth/sign-in/email')
    await ok.fetch('/_serverFn/abc')

    expect(other.location.assign).not.toHaveBeenCalled()
    expect(ok.location.assign).not.toHaveBeenCalled()
  })
})
