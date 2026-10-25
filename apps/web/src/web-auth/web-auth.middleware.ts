import { createMiddleware } from '@tanstack/react-start'

import { decideWebAccess, isPublicWebPath } from './web-auth.access'
import { checkWebSession } from './web-auth.api'

function jsonResponse(status: number, error: string): Response {
  return new Response(JSON.stringify({ error }), {
    status,
    headers: { 'content-type': 'application/json' },
  })
}

function redirectTo(location: string): Response {
  return new Response(null, { status: 302, headers: { location } })
}

export const webAuthMiddleware = createMiddleware().server(async ({ next, request }) => {
  const { pathname } = new URL(request.url)
  const cookie = request.headers.get('cookie') ?? ''

  if (pathname === '/login' && request.method === 'GET') {
    const signedIn = await checkWebSession(cookie).then(
      (state) => state === 'signed_in',
      () => false,
    )

    return signedIn ? redirectTo('/') : next()
  }

  if (isPublicWebPath(pathname)) {
    return next()
  }

  let state

  try {
    state = await checkWebSession(cookie)
  } catch {
    return jsonResponse(503, 'auth_unavailable')
  }

  const decision = decideWebAccess({
    method: request.method,
    pathname,
    state,
    production: process.env.NODE_ENV === 'production',
  })

  switch (decision.kind) {
    case 'allow':
      return next()
    case 'redirect':
      return redirectTo(decision.to)
    case 'unauthorized':
      return jsonResponse(401, 'unauthorized')
    case 'unavailable':
      return jsonResponse(503, 'auth_not_configured')
  }
})
