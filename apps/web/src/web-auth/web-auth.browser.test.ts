import { afterEach, describe, expect, it, vi } from 'vitest'

import { signInWithPassword, signOut } from './web-auth.browser'

afterEach(() => {
  vi.unstubAllGlobals()
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

describe('password sign-in', () => {
  const assign = vi.fn()

  function stubBrowser(fetchMock: ReturnType<typeof vi.fn>) {
    assign.mockReset()
    vi.stubGlobal('window', { location: { assign } })
    vi.stubGlobal('fetch', fetchMock)
  }

  it('should send email and password in the body and land on the home page', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response('{}', { status: 200 }))

    stubBrowser(fetchMock)

    expect(await signInWithPassword(' me@example.com ', 'pw-12345678901')).toBe('signed_in')
    expect(fetchMock.mock.calls[0]?.[0]).toBe('/api/auth/sign-in/email')
    expect(JSON.parse(fetchMock.mock.calls[0]?.[1].body)).toEqual({
      email: 'me@example.com',
      password: 'pw-12345678901',
    })
    expect(assign).toHaveBeenCalledWith('/')
  })

  it('should report too many attempts separately and stay on the page for every failure', async () => {
    stubBrowser(vi.fn().mockResolvedValue(new Response('{}', { status: 429 })))
    expect(await signInWithPassword('a@b.c', 'x')).toBe('rate_limited')

    stubBrowser(vi.fn().mockResolvedValue(new Response('{}', { status: 401 })))
    expect(await signInWithPassword('a@b.c', 'x')).toBe('failed')

    stubBrowser(vi.fn().mockRejectedValue(new Error('offline')))
    expect(await signInWithPassword('a@b.c', 'x')).toBe('failed')
    expect(assign).not.toHaveBeenCalled()
  })
})
