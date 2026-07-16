import { createFileRoute } from '@tanstack/react-router'

import { apiBaseUrl, authHeaders } from '../curriculum/api-client'

export const Route = createFileRoute('/api/electric-shape')({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const incomingUrl = new URL(request.url)
        const targetUrl = `${apiBaseUrl()}/electric/v1/shape${incomingUrl.search}`

        const upstream = await fetch(targetUrl, {
          headers: authHeaders(),
        })

        return new Response(upstream.body, {
          status: upstream.status,
          headers: upstream.headers,
        })
      },
    },
  },
})
