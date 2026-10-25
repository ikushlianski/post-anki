import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { discardKnowledgeSource, regenerateKnowledgeSource } from './api-client'

const fetchMock = vi.fn()

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  })
}

describe('note actions client', () => {
  beforeEach(() => {
    process.env.API_BASE_URL = 'https://api.test'
    fetchMock.mockReset()
    vi.stubGlobal('fetch', fetchMock)
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('should send the replacement text with the retry so the AI reads the edited note', async () => {
    fetchMock.mockResolvedValue(jsonResponse(202, { status: 'running', supersededCount: 0 }))

    await regenerateKnowledgeSource('ks_1', undefined, 'edited')

    const [url, init] = fetchMock.mock.calls[0]

    expect(String(url)).toBe('https://api.test/knowledge-sources/ks_1/regeneration')
    expect(JSON.parse(init.body)).toEqual({ text: 'edited' })
  })

  it('should send an empty body for a plain retry and report already_running on a 409', async () => {
    fetchMock.mockResolvedValue(jsonResponse(409, { error: 'already_running' }))

    const outcome = await regenerateKnowledgeSource('ks_1')

    expect(outcome).toEqual({ status: 'already_running' })
    expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toEqual({})
  })

  it('should post a discard to the note and return the deletion counts', async () => {
    fetchMock.mockResolvedValue(jsonResponse(200, { counts: { knowledgeSources: 1 } }))

    const result = await discardKnowledgeSource('ks_1')

    expect(String(fetchMock.mock.calls[0][0])).toBe('https://api.test/knowledge-sources/ks_1/discards')
    expect(fetchMock.mock.calls[0][1].method).toBe('POST')
    expect(result.counts.knowledgeSources).toBe(1)
  })
})
