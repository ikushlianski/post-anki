import { afterEach, describe, expect, it, vi } from 'vitest'

import { requestMagicLink, signOut } from './web-auth.browser'

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('requestMagicLink', () => {
  it('should ask for the link to land on the app and failures on the login page', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response('{}', { status: 200 }))

    vi.stubGlobal('fetch', fetchMock)

    expect(await requestMagicLink('a@b.c')).toBe('sent')
    expect(JSON.parse(fetchMock.mock.calls[0]?.[1].body)).toEqual({
      email: 'a@b.c',
      callbackURL: '/',
      errorCallbackURL: '/login',
    })
  })

  it('should report a rate limit separately from other failures', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('{}', { status: 429 })))
    expect(await requestMagicLink('a@b.c')).toBe('rate_limited')

    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('{}', { status: 500 })))
    expect(await requestMagicLink('a@b.c')).toBe('failed')
  })
})

describe('signOut', () => {
  const assign = vi.fn()

  function stubLocation() {
    vi.stubGlobal('location', { assign })
    vi.stubGlobal('window', { location: { assign } })
  }

  it('should go to the login page only after the server ended the session', async () => {
    stubLocation()
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('{}', { status: 200 })))

    expect(await signOut()).toBe(true)
    expect(assign).toHaveBeenCalledWith('/login')
  })

  it('should stay on the page and report failure when sign-out is refused or the network is down', async () => {
    assign.mockReset()
    stubLocation()
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('{}', { status: 403 })))
    expect(await signOut()).toBe(false)

    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('offline')))
    expect(await signOut()).toBe(false)
    expect(assign).not.toHaveBeenCalled()
  })
})
