import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import {
  ApiError,
  resolveDomainSupersessionSuggestion,
  resolveDomainTopicSuggestion,
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
    process.env.API_BASE_URL = 'http://api.test'
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
})
