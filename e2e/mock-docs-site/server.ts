import http from 'node:http'

const PORT = Number(process.env.PORT ?? process.env.E2E_MOCK_DOCS_PORT ?? 4998)

const LLMS_TXT = `# E2E Fixture Docs

> A synthetic documentation site used only by the post-anki e2e suite.

## Docs

- [Getting started](https://example.invalid/e2e-fixture/getting-started): install and first workflow
- [Core concepts](https://example.invalid/e2e-fixture/core-concepts): the durable execution model
- [Advanced patterns](https://example.invalid/e2e-fixture/advanced-patterns): retries, versioning, and edge cases
`

function send(res: http.ServerResponse, status: number, body: string, contentType: string): void {
  res.writeHead(status, { 'content-type': contentType })
  res.end(body)
}

const server = http.createServer((req, res) => {
  if (req.method !== 'GET') {
    send(res, 404, 'not found', 'text/plain')
    return
  }

  if (req.url === '/healthz') {
    send(res, 200, JSON.stringify({ ok: true }), 'application/json')
    return
  }

  if (req.url === '/llms.txt') {
    send(res, 200, LLMS_TXT, 'text/plain')
    return
  }

  // llms-full.txt and every other path 404 — this fixture site only
  // publishes a curated llms.txt, exercising the "primary map found on the
  // first probe" path (SCENARIO 2).
  send(res, 404, 'not found', 'text/plain')
})

server.listen(PORT, () => {
  console.log(`[mock-docs-site] listening on :${PORT}`)
})
