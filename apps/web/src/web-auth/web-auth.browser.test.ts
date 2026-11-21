import { afterEach, describe, expect, it, vi } from 'vitest'

import { clearOfflineStore } from '../review-offline/clear-offline-store'
import { signInWithPassword, signOut } from './web-auth.browser'

vi.mock('../review-offline/clear-offline-store', () => ({ clearOfflineStore: vi.fn().mockResolvedValue(undefined) }))

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
    expect(clearOfflineStore).toHaveBeenCalledTimes(1)
  })

  it('should report failure and stay on the page when the offline data could not be wiped', async () => {
    assign.mockReset()
    vi.mocked(clearOfflineStore).mockRejectedValueOnce(new Error('locked'))
    stubLocation()
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('{}', { status: 200 })))

    expect(await signOut()).toBe(false)
    expect(assign).not.toHaveBeenCalled()
  })

  it('should keep the saved offline cards when sign-out fails', async () => {
    vi.mocked(clearOfflineStore).mockClear()
    stubLocation()
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('{}', { status: 403 })))

    await signOut()

    expect(clearOfflineStore).not.toHaveBeenCalled()
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
