import { apiBaseUrl, authHeaders } from '../curriculum/api-client'

const ALLOWED_ENDPOINTS: Record<string, string> = {
  'sign-in/magic-link': 'POST',
  'magic-link/verify': 'GET',
  'sign-out': 'POST',
}

const FORWARDED_REQUEST_HEADERS = ['cookie', 'origin', 'content-type'] as const
const STRIPPED_RESPONSE_HEADERS = new Set([
  'host',
  'content-encoding',
  'content-length',
  'set-cookie',
  'connection',
  'keep-alive',
  'transfer-encoding',
])

export function isAllowedAuthEndpoint(method: string, endpoint: string): boolean {
  return ALLOWED_ENDPOINTS[endpoint] === method
}

export function clientIpFrom(forwardedFor: string | null): string | undefined {
  const last = forwardedFor?.split(',').pop()?.trim()

  return last ? last : undefined
}

export function buildUpstreamHeaders(incoming: Headers): Headers {
  const headers = new Headers()
  const shared = authHeaders()

  if (shared.authorization) {
    headers.set('authorization', shared.authorization)
  }

  for (const name of FORWARDED_REQUEST_HEADERS) {
    const value = incoming.get(name)

    if (value) {
      headers.set(name, value)
    }
  }

  const ip = clientIpFrom(incoming.get('x-forwarded-for'))

  if (ip) {
    headers.set('x-pa-client-ip', ip)
  }

  return headers
}

export function buildDownstreamHeaders(upstream: Headers): Headers {
  const headers = new Headers()

  upstream.forEach((value, name) => {
    if (!STRIPPED_RESPONSE_HEADERS.has(name.toLowerCase())) {
      headers.append(name, value)
    }
  })

  for (const cookie of upstream.getSetCookie()) {
    headers.append('set-cookie', cookie)
  }

  return headers
}

export async function proxyAuthRequest(request: Request, endpoint: string): Promise<Response> {
  if (!isAllowedAuthEndpoint(request.method, endpoint)) {
    return new Response('Not found', { status: 404 })
  }

  const { search } = new URL(request.url)
  const hasBody = request.method !== 'GET'

  try {
    const upstream = await fetch(`${apiBaseUrl()}/api/auth/${endpoint}${search}`, {
      method: request.method,
      headers: buildUpstreamHeaders(request.headers),
      body: hasBody ? await request.text() : undefined,
      redirect: 'manual',
    })

    return new Response(upstream.body, {
      status: upstream.status,
      headers: buildDownstreamHeaders(upstream.headers),
    })
  } catch {
    return new Response('Sign-in is unavailable', { status: 503 })
  }
}
