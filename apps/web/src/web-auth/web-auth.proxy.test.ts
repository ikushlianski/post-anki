import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { proxyAuthRequest } from './web-auth.proxy'

const fetchMock = vi.fn()

beforeEach(() => {
  process.env.API_BASE_URL = 'http://localhost:5560'
  process.env.API_SHARED_SECRET = 'shh'
  vi.stubGlobal('fetch', fetchMock)
})

afterEach(() => {
  fetchMock.mockReset()
  vi.unstubAllGlobals()
})

function post(headers: Record<string, string> = {}) {
  return new Request('https://postanki.ilya.online/api/auth/x', {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...headers },
    body: '{"email":"a@b.c"}',
  })
}

describe('auth proxy', () => {
  it.each([
    ['POST', 'sign-in/magic-link'],
    ['POST', 'sign-in/api-key'],
    ['POST', 'sign-in/email'],
    ['GET', 'magic-link/verify'],
    ['POST', 'sign-out'],
  ])('should forward %s %s to the API', async (method, endpoint) => {
    fetchMock.mockResolvedValue(new Response('{}', { status: 200 }))

    const request = new Request('https://postanki.ilya.online/api/auth/x?token=t', {
      method,
      body: method === 'POST' ? '{}' : undefined,
    })
    const response = await proxyAuthRequest(request, endpoint)

    expect(response.status).toBe(200)
    expect(fetchMock.mock.calls[0]?.[0]).toBe(`http://localhost:5560/api/auth/${endpoint}?token=t`)
  })

  it.each([
    ['POST', 'sign-up/email'],
    ['GET', 'get-session'],
    ['GET', 'sign-in/magic-link'],
    ['GET', 'sign-in/api-key'],
    ['GET', 'sign-in/email'],
    ['POST', 'magic-link/verify'],
    ['GET', ''],
  ])('should answer 404 for %s %s without calling the API', async (method, endpoint) => {
    const response = await proxyAuthRequest(
      new Request('https://postanki.ilya.online/api/auth/x', { method }),
      endpoint,
    )

    expect(response.status).toBe(404)
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('should add the shared secret and ignore any browser Authorization header', async () => {
    fetchMock.mockResolvedValue(new Response('{}'))

    await proxyAuthRequest(post({ authorization: 'Bearer pat_browser' }), 'sign-out')

    const headers = fetchMock.mock.calls[0]?.[1].headers as Headers

    expect(headers.get('authorization')).toBe('Bearer shh')
  })

  it('should forward cookie, origin and content type and use the right-most forwarded address', async () => {
    fetchMock.mockResolvedValue(new Response('{}'))

    await proxyAuthRequest(
      post({
        cookie: 'a=1',
        origin: 'https://postanki.ilya.online',
        'x-forwarded-for': '6.6.6.6, 1.2.3.4',
      }),
      'sign-out',
    )

    const headers = fetchMock.mock.calls[0]?.[1].headers as Headers

    expect(headers.get('cookie')).toBe('a=1')
    expect(headers.get('origin')).toBe('https://postanki.ilya.online')
    expect(headers.get('content-type')).toBe('application/json')
    expect(headers.get('x-pa-client-ip')).toBe('1.2.3.4')
  })

  it('should not trust a browser-supplied client IP header', async () => {
    fetchMock.mockResolvedValue(new Response('{}'))

    await proxyAuthRequest(post({ 'x-pa-client-ip': '9.9.9.9' }), 'sign-out')

    const headers = fetchMock.mock.calls[0]?.[1].headers as Headers

    expect(headers.get('x-pa-client-ip')).toBeNull()
  })

  it('should return the redirect and every Set-Cookie untouched and drop encoding headers', async () => {
    const upstreamHeaders = new Headers({
      location: '/',
      'content-encoding': 'gzip',
      'content-length': '12',
    })

    upstreamHeaders.append('set-cookie', 'session=1; HttpOnly')
    upstreamHeaders.append('set-cookie', 'other=2; Secure')
    fetchMock.mockResolvedValue(new Response(null, { status: 302, headers: upstreamHeaders }))

    const response = await proxyAuthRequest(
      new Request('https://postanki.ilya.online/api/auth/magic-link/verify?token=t'),
      'magic-link/verify',
    )

    expect(response.status).toBe(302)
    expect(response.headers.get('location')).toBe('/')
    expect(response.headers.getSetCookie()).toEqual(['session=1; HttpOnly', 'other=2; Secure'])
    expect(response.headers.get('content-encoding')).toBeNull()
    expect(fetchMock.mock.calls[0]?.[1].redirect).toBe('manual')
  })

  it('should answer 503 when the API is unreachable', async () => {
    fetchMock.mockRejectedValue(new Error('down'))

    const response = await proxyAuthRequest(post(), 'sign-out')

    expect(response.status).toBe(503)
  })

  it('should not pass hop-by-hop headers back to the browser', async () => {
    fetchMock.mockResolvedValue(
      new Response('{}', { headers: { connection: 'keep-alive', 'keep-alive': 'timeout=5' } }),
    )

    const response = await proxyAuthRequest(post(), 'sign-out')

    expect(response.headers.get('connection')).toBeNull()
    expect(response.headers.get('keep-alive')).toBeNull()
  })

  it('should refuse an oversized sign-in body without calling the API', async () => {
    const response = await proxyAuthRequest(
      new Request('https://postanki.ilya.online/api/auth/x', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ email: 'a'.repeat(5000) }),
      }),
      'sign-in/magic-link',
    )

    expect(response.status).toBe(413)
    expect(fetchMock).not.toHaveBeenCalled()
  })
})
