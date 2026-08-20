import http from 'node:http';

import {
  resolveContent,
  resetMockControls,
  setOverrideText,
  setForceErrorNext,
  debugDumpSchema,
  type ChatRequestBody,
} from './responses';

// Local, repo-owned mock of OpenRouter's /chat/completions response shape —
// ported from the *pattern* of verification-repo's
// projects/post-anki/post-anki/mock-openrouter/server.ts (same control
// surface, same completion envelope), not its content. That server's
// responses.ts hardcodes ~1200 lines of per-scenario stub plans matched
// against verification-repo's own ticket fixtures; this one instead fills
// whatever JSON-Schema the real caller sent (see schema-fill.ts), so it
// stays correct as this app's agents/schemas evolve without anyone having
// to maintain a parallel stub library.
//
// Point apps/api/.env.local's OPENROUTER_BASE_URL at
// http://localhost:<PORT> to route real LLM calls here during local dev-loop
// testing — the same override mechanism (env.ts's OPENROUTER_BASE_URL) the
// verification-repo e2e mock already uses, not a second one.
const PORT = Number(process.env.PORT ?? process.env.E2E_LOCAL_MOCK_LLM_PORT ?? 4998);

function send(res: http.ServerResponse, status: number, payload: unknown): void {
  res.writeHead(status, { 'content-type': 'application/json' });
  res.end(JSON.stringify(payload));
}

function completion(content: string): unknown {
  return {
    id: `mock-${Date.now()}`,
    object: 'chat.completion',
    created: Math.floor(Date.now() / 1000),
    model: 'mock-openrouter-local',
    choices: [
      {
        index: 0,
        message: { role: 'assistant', content },
        finish_reason: 'stop',
      },
    ],
    usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 },
  };
}

async function readBody(req: http.IncomingMessage): Promise<string> {
  const chunks: Buffer[] = [];

  for await (const chunk of req) {
    chunks.push(chunk as Buffer);
  }

  return Buffer.concat(chunks).toString('utf8');
}

const server = http.createServer((req, res) => {
  void (async () => {
    if (req.method === 'GET' && req.url === '/healthz') {
      send(res, 200, { ok: true });
      return;
    }

    if (req.method === 'POST' && req.url === '/_mock/reset') {
      resetMockControls();
      send(res, 200, { ok: true });
      return;
    }

    if (req.method === 'POST' && req.url === '/_mock/set-text') {
      const raw = await readBody(req);
      const body = JSON.parse(raw || '{}') as { text?: string | null };

      setOverrideText(body.text ?? null);
      send(res, 200, { ok: true });
      return;
    }

    if (req.method === 'POST' && req.url === '/_mock/force-error') {
      setForceErrorNext(true);
      send(res, 200, { ok: true });
      return;
    }

    if (req.method !== 'POST') {
      send(res, 404, { error: 'not_found' });
      return;
    }

    const raw = await readBody(req);
    let body: ChatRequestBody = {};

    try {
      body = JSON.parse(raw || '{}') as ChatRequestBody;
    } catch {
      body = {};
    }

    // A real OpenRouter completion always takes at least a few hundred
    // milliseconds. Keeping a small delay here means a "pending"/typing-
    // indicator UI state has a real chance to paint before the mutation
    // resolves, same rationale as verification-repo's mock.
    if (process.env.E2E_LOCAL_MOCK_DEBUG_SCHEMA) {
      debugDumpSchema(body);
    }

    setTimeout(() => {
      const resolved = resolveContent(body);

      if (resolved.status && resolved.status !== 200) {
        send(res, resolved.status, { error: { message: 'mock forced failure (e2e-local)' } });
        return;
      }

      send(res, 200, completion(resolved.content));
    }, 200);
  })();
});

server.listen(PORT, () => {
  console.log(`[e2e-local mock-openrouter] listening on :${PORT}`);
});
