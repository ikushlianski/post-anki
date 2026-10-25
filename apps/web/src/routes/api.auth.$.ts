import { createFileRoute } from '@tanstack/react-router'

import { proxyAuthRequest } from '../web-auth/web-auth.proxy'

export const Route = createFileRoute('/api/auth/$')({
  server: {
    handlers: {
      GET: ({ request, params }) => proxyAuthRequest(request, params._splat ?? ''),
      POST: ({ request, params }) => proxyAuthRequest(request, params._splat ?? ''),
      PUT: () => new Response('Not found', { status: 404 }),
      PATCH: () => new Response('Not found', { status: 404 }),
      DELETE: () => new Response('Not found', { status: 404 }),
    },
  },
})
