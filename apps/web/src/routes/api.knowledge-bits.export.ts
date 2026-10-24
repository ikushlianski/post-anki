import { createFileRoute } from '@tanstack/react-router'
import { knowledgeBitExportQuerySchema } from '@post-anki/shared'

import { apiBaseUrl, authHeaders } from '../curriculum/api-client'

export const Route = createFileRoute('/api/knowledge-bits/export')({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const parsed = knowledgeBitExportQuerySchema.safeParse(
          Object.fromEntries(new URL(request.url).searchParams),
        )

        if (!parsed.success) {
          return Response.json({ error: 'invalid_input' }, { status: 400 })
        }

        let upstream: Response

        try {
          upstream = await fetch(
            `${apiBaseUrl()}/knowledge-bits/export?format=${parsed.data.format}`,
            { headers: authHeaders(), signal: request.signal },
          )
        } catch (err) {
          if (request.signal.aborted) {
            throw err
          }

          return new Response('The export service is unavailable. Please try again.', {
            status: 502,
            headers: { 'content-type': 'text/plain; charset=utf-8' },
          })
        }

        const headers = new Headers()

        for (const name of ['content-type', 'content-disposition', 'cache-control']) {
          const value = upstream.headers.get(name)

          if (value) {
            headers.set(name, value)
          }
        }

        return new Response(upstream.body, { status: upstream.status, headers })
      },
    },
  },
})
