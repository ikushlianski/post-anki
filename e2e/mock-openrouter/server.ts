import http from 'node:http'

import { resolveContent, type ChatRequestBody } from './responses'

const PORT = Number(process.env.PORT ?? process.env.E2E_MOCK_LLM_PORT ?? 4999)

function send(res: http.ServerResponse, status: number, payload: unknown): void {
  res.writeHead(status, { 'content-type': 'application/json' })
  res.end(JSON.stringify(payload))
}

function completion(content: string): unknown {
  return {
    id: `mock-${Date.now()}`,
    object: 'chat.completion',
    created: Math.floor(Date.now() / 1000),
    model: 'mock-openrouter',
    choices: [
      {
        index: 0,
        message: { role: 'assistant', content },
        finish_reason: 'stop',
      },
    ],
    usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 },
  }
}

const server = http.createServer((req, res) => {
  if (req.method === 'GET' && req.url === '/healthz') {
    send(res, 200, { ok: true })
    return
  }

  if (req.method !== 'POST') {
    send(res, 404, { error: 'not_found' })
    return
  }

  let raw = ''
  req.on('data', (chunk) => {
    raw += chunk
  })
  req.on('end', () => {
    let body: ChatRequestBody = {}

    try {
      body = JSON.parse(raw || '{}') as ChatRequestBody
    } catch {
      body = {}
    }

    send(res, 200, completion(resolveContent(body)))
  })
})

server.listen(PORT, () => {
  console.log(`[mock-openrouter] listening on :${PORT}`)
})
