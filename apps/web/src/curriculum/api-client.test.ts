import { MAX_CHAT_TRANSCRIPT_MESSAGES } from '@post-anki/shared'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import {
  ApiError,
  askGlobalCardChat,
  askKnowledgeBitChat,
  askStudyChat,
  createDerivedKnowledgeItem,
  createManualKnowledgeItem,
  createModelComparisonRun,
  estimateModelComparison,
  gradeModelComparisonCard,
  gradeModelComparisonResult,
  resolveDomainSupersessionSuggestion,
  resolveDomainTopicSuggestion,
  resolvePlacementSuggestion,
} from './api-client'

const fetchMock = vi.fn()

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  })
}

describe('doc-scan suggestion resolvers', () => {
  beforeEach(() => {
    process.env.API_BASE_URL = 'https://api.test'
    fetchMock.mockReset()
    vi.stubGlobal('fetch', fetchMock)
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  describe('resolveDomainTopicSuggestion', () => {
    it('reports the resolved suggestion on a 200', async () => {
      fetchMock.mockResolvedValue(jsonResponse(200, { id: 'sug-1', status: 'accepted' }))

      const result = await resolveDomainTopicSuggestion('sug-1', 'accepted')

      expect(result.outcome).toBe('resolved')
      expect(result.outcome === 'resolved' && result.suggestion.id).toBe('sug-1')
    })

    it('reports already_resolved instead of throwing on a 409', async () => {
      fetchMock.mockResolvedValue(jsonResponse(409, { error: 'already_resolved' }))

      const result = await resolveDomainTopicSuggestion('sug-1', 'accepted')

      expect(result.outcome).toBe('already_resolved')
    })

    it('still throws on a 404', async () => {
      fetchMock.mockResolvedValue(jsonResponse(404, { error: 'not_found' }))

      await expect(resolveDomainTopicSuggestion('sug-1', 'accepted')).rejects.toBeInstanceOf(
        ApiError,
      )
    })

    it('still throws on a 500', async () => {
      fetchMock.mockResolvedValue(jsonResponse(500, { error: 'internal' }))

      await expect(resolveDomainTopicSuggestion('sug-1', 'accepted')).rejects.toBeInstanceOf(
        ApiError,
      )
    })

    it('still throws when the network call itself fails', async () => {
      fetchMock.mockRejectedValue(new TypeError('fetch failed'))

      await expect(resolveDomainTopicSuggestion('sug-1', 'accepted')).rejects.toThrow(
        'fetch failed',
      )
    })

    it('does not swallow a 409 that is not already_resolved', async () => {
      fetchMock.mockResolvedValue(jsonResponse(409, { error: 'turn_in_progress' }))

      await expect(resolveDomainTopicSuggestion('sug-1', 'accepted')).rejects.toBeInstanceOf(
        ApiError,
      )
    })
  })

  describe('resolveDomainSupersessionSuggestion', () => {
    it('reports the resolved suggestion on a 200', async () => {
      fetchMock.mockResolvedValue(jsonResponse(200, { id: 'sug-2', status: 'rejected' }))

      const result = await resolveDomainSupersessionSuggestion('sug-2', 'rejected')

      expect(result.outcome).toBe('resolved')
      expect(result.outcome === 'resolved' && result.suggestion.id).toBe('sug-2')
    })

    it('reports already_resolved instead of throwing on a 409', async () => {
      fetchMock.mockResolvedValue(jsonResponse(409, { error: 'already_resolved' }))

      const result = await resolveDomainSupersessionSuggestion('sug-2', 'rejected')

      expect(result.outcome).toBe('already_resolved')
    })

    it('still throws on a 404', async () => {
      fetchMock.mockResolvedValue(jsonResponse(404, { error: 'not_found' }))

      await expect(
        resolveDomainSupersessionSuggestion('sug-2', 'rejected'),
      ).rejects.toBeInstanceOf(ApiError)
    })

    it('still throws on a 500', async () => {
      fetchMock.mockResolvedValue(jsonResponse(500, { error: 'internal' }))

      await expect(
        resolveDomainSupersessionSuggestion('sug-2', 'rejected'),
      ).rejects.toBeInstanceOf(ApiError)
    })

    it('still throws when the network call itself fails', async () => {
      fetchMock.mockRejectedValue(new TypeError('fetch failed'))

      await expect(resolveDomainSupersessionSuggestion('sug-2', 'rejected')).rejects.toThrow(
        'fetch failed',
      )
    })
  })

  describe('resolvePlacementSuggestion', () => {
    it('reports the outcome on a 200', async () => {
      fetchMock.mockResolvedValue(jsonResponse(200, { outcome: 'accepted', topicId: 'top-1' }))

      const result = await resolvePlacementSuggestion('kb-1', 'accepted', 'mod-1', 'Title')

      expect(result).toEqual({ outcome: 'accepted', topicId: 'top-1' })
    })

    it('reports already_resolved instead of throwing on a 409', async () => {
      fetchMock.mockResolvedValue(jsonResponse(409, { error: 'already_resolved' }))

      const result = await resolvePlacementSuggestion('kb-1', 'rejected')

      expect(result).toEqual({ outcome: 'already_resolved' })
    })

    it('does not swallow a 409 that is not already_resolved', async () => {
      fetchMock.mockResolvedValue(jsonResponse(409, { error: 'turn_in_progress' }))

      await expect(resolvePlacementSuggestion('kb-1', 'rejected')).rejects.toBeInstanceOf(
        ApiError,
      )
    })

    it('still throws on a 404', async () => {
      fetchMock.mockResolvedValue(jsonResponse(404, { error: 'not_found' }))

      await expect(resolvePlacementSuggestion('kb-1', 'rejected')).rejects.toBeInstanceOf(
        ApiError,
      )
    })
  })

  describe('askGlobalCardChat', () => {
    it('forwards allowGeneralKnowledge in the request body when set', async () => {
      fetchMock.mockResolvedValue(jsonResponse(200, { reply: 'hi', matchedCards: [] }))

      await askGlobalCardChat({ message: 'hi', allowGeneralKnowledge: true })

      const [, init] = fetchMock.mock.calls[0] as [string, RequestInit]
      const body = JSON.parse(init.body as string)

      expect(body.allowGeneralKnowledge).toBe(true)
    })

    it('sends allowGeneralKnowledge as undefined when the caller omits it', async () => {
      fetchMock.mockResolvedValue(jsonResponse(200, { reply: 'hi', matchedCards: [] }))

      await askGlobalCardChat({ message: 'hi' })

      const [, init] = fetchMock.mock.calls[0] as [string, RequestInit]
      const body = JSON.parse(init.body as string)

      expect(body.allowGeneralKnowledge).toBeUndefined()
    })
  })

  describe('chat transcript trimming', () => {
    const longHistory = Array.from({ length: MAX_CHAT_TRANSCRIPT_MESSAGES + 30 }, (_, i) => ({
      role: i % 2 === 0 ? ('user' as const) : ('assistant' as const),
      text: `turn-${i}`,
    }))

    async function sentTranscript(): Promise<{ text: string }[]> {
      const [, init] = fetchMock.mock.calls[0] as [string, RequestInit]

      return JSON.parse(init.body as string).transcript
    }

    it('should send only the newest turns of a long card chat history', async () => {
      fetchMock.mockResolvedValue(jsonResponse(200, { reply: 'ok' }))

      await askKnowledgeBitChat('bit-1', { message: 'hi', transcript: longHistory })

      const sent = await sentTranscript()

      expect(sent).toHaveLength(MAX_CHAT_TRANSCRIPT_MESSAGES)
      expect(sent.at(-1)?.text).toBe(longHistory.at(-1)?.text)
    })

    it('should send only the newest turns of a long global card chat history', async () => {
      fetchMock.mockResolvedValue(jsonResponse(200, { reply: 'ok', matchedCards: [] }))

      await askGlobalCardChat({ message: 'hi', transcript: longHistory })

      expect(await sentTranscript()).toHaveLength(MAX_CHAT_TRANSCRIPT_MESSAGES)
    })

    it('should send only the newest turns of a long study chat history', async () => {
      fetchMock.mockResolvedValue(jsonResponse(200, { reply: 'ok' }))

      await askStudyChat({ topicId: 't1', message: 'hi', transcript: longHistory })

      expect(await sentTranscript()).toHaveLength(MAX_CHAT_TRANSCRIPT_MESSAGES)
    })
  })

  describe('askKnowledgeBitChat', () => {
    it('posts to the bit-scoped chat endpoint with the message and transcript', async () => {
      fetchMock.mockResolvedValue(jsonResponse(200, { reply: 'it means X' }))

      const result = await askKnowledgeBitChat('bit-1', { message: 'what does this mean?' })

      const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit]
      const body = JSON.parse(init.body as string)

      expect(url).toBe('https://api.test/knowledge-bits/bit-1/chat')
      expect(body.message).toBe('what does this mean?')
      expect(result).toEqual({ reply: 'it means X' })
    })

    it('forwards allowGeneralKnowledge in the request body when set', async () => {
      fetchMock.mockResolvedValue(jsonResponse(200, { reply: 'hi' }))

      await askKnowledgeBitChat('bit-1', { message: 'hi', allowGeneralKnowledge: true })

      const [, init] = fetchMock.mock.calls[0] as [string, RequestInit]
      const body = JSON.parse(init.body as string)

      expect(body.allowGeneralKnowledge).toBe(true)
    })

    it('returns null instead of throwing when the request fails', async () => {
      fetchMock.mockResolvedValue(jsonResponse(404, { error: 'not_found' }))

      const result = await askKnowledgeBitChat('bit-missing', { message: 'hi' })

      expect(result).toBeNull()
    })

    it('returns null when the network call itself fails', async () => {
      fetchMock.mockRejectedValue(new TypeError('fetch failed'))

      const result = await askKnowledgeBitChat('bit-1', { message: 'hi' })

      expect(result).toBeNull()
    })
  })
})

describe('manual and derived knowledge item creation', () => {
  const item = {
    id: 'kb-new',
    body: 'Q\nA',
    background: null,
    variants: [],
    feedback: null,
    origin: 'manual',
    isAiGenerated: true,
    sourceLinks: ['https://example.com/a'],
  }

  beforeEach(() => {
    process.env.API_BASE_URL = 'https://api.test'
    fetchMock.mockReset()
    vi.stubGlobal('fetch', fetchMock)
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('should post the card once-encoded to the source items route and return the item as is', async () => {
    fetchMock.mockResolvedValue(jsonResponse(201, item))

    const input = { front: 'Q', back: 'A', aiGenerated: true, sourceLinks: ['https://example.com/a'] }
    const result = await createManualKnowledgeItem('ks-1', input)

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit]

    expect(url).toBe('https://api.test/knowledge-sources/ks-1/items')
    expect(init.method).toBe('POST')
    expect(JSON.parse(init.body as string)).toEqual(input)
    expect(result).toEqual(item)
  })

  it('should post the card to the derived-items route of the studied item', async () => {
    fetchMock.mockResolvedValue(jsonResponse(201, item))

    const result = await createDerivedKnowledgeItem('kb-1', { front: 'Q', back: 'A' })

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit]

    expect(url).toBe('https://api.test/knowledge-bits/kb-1/derived-items')
    expect(init.method).toBe('POST')
    expect(JSON.parse(init.body as string)).toEqual({ front: 'Q', back: 'A' })
    expect(result).toEqual(item)
  })
})

describe('model comparison requests', () => {
  beforeEach(() => {
    process.env.API_BASE_URL = 'https://api.test'
    fetchMock.mockReset()
    vi.stubGlobal('fetch', fetchMock)
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  function sentBody(): unknown {
    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit]

    return JSON.parse(init.body as string)
  }

  const input = { excerpt: 'text', modelIds: ['openrouter/openai/gpt-4o-mini' as const] }

  it('should send the estimate input as a JSON object, encoded once', async () => {
    fetchMock.mockResolvedValue(jsonResponse(200, {}))

    await estimateModelComparison(input)

    expect(sentBody()).toEqual(input)
  })

  it('should send the new run input as a JSON object, encoded once', async () => {
    fetchMock.mockResolvedValue(jsonResponse(201, {}))

    await createModelComparisonRun(input)

    expect(sentBody()).toEqual(input)
  })

  it('should send a result grade as a JSON object, encoded once', async () => {
    fetchMock.mockResolvedValue(jsonResponse(200, { ok: true }))

    await gradeModelComparisonResult('run-1', 'model-1', { extractionRating: 4 })

    expect(sentBody()).toEqual({ extractionRating: 4 })
  })

  it('should send a card grade as a JSON object, encoded once', async () => {
    fetchMock.mockResolvedValue(jsonResponse(200, { ok: true }))

    await gradeModelComparisonCard('run-1', 'model-1', 2, { rating: 3 })

    expect(sentBody()).toEqual({ rating: 3 })
  })
})
