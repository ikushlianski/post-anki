import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { ApiError, request } from './api-client'
import { DEFAULT_REQUEST_TIMEOUT_MS, LLM_REQUEST_TIMEOUT_MS, requestTimeoutMs } from './request-timeouts'

describe('api request timeout', () => {
  beforeEach(() => {
    process.env.API_BASE_URL = 'https://api.test'
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('should give up on a call that never answers and report a 504 timeout', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(
        (_url: string, init: { signal: AbortSignal }) =>
          new Promise((_resolve, reject) => {
            init.signal.addEventListener('abort', () => reject(init.signal.reason))
          }),
      ),
    )

    const pending = request('/home', { timeoutMs: 20 }).catch((error: unknown) => error)

    const error = await pending

    expect(error).toBeInstanceOf(ApiError)
    expect((error as ApiError).status).toBe(504)
    expect((error as ApiError).code).toBe('timeout')
  })

  it.each([
    ['POST', '/subjects/s1/doc-scans'],
    ['POST', '/curricula'],
    ['POST', '/curricula/c1/retry-research'],
    ['POST', '/knowledge-sources'],
    ['POST', '/knowledge-bits/b1/chat'],
    ['POST', '/knowledge-bits/question-variants/v1/answers'],
    ['POST', '/probe-sessions'],
    ['POST', '/probe-sessions/p1/answer'],
    ['POST', '/global-card-chat'],
  ])('should give %s %s the long AI limit', (method, path) => {
    expect(requestTimeoutMs(path, method)).toBe(LLM_REQUEST_TIMEOUT_MS)
  })

  it('should keep plain reads and writes on the default limit', () => {
    expect(requestTimeoutMs('/home')).toBe(DEFAULT_REQUEST_TIMEOUT_MS)
    expect(requestTimeoutMs('/subjects/s1/doc-scans', 'GET')).toBe(DEFAULT_REQUEST_TIMEOUT_MS)
    expect(requestTimeoutMs('/knowledge-bits/b1/approve', 'POST')).toBe(DEFAULT_REQUEST_TIMEOUT_MS)
  })

  it('should let the caller cancel first without reporting a timeout', async () => {
    const controller = new AbortController()

    vi.stubGlobal(
      'fetch',
      vi.fn(
        (_url: string, init: { signal: AbortSignal }) =>
          new Promise((_resolve, reject) => {
            init.signal.addEventListener('abort', () => reject(init.signal.reason))
          }),
      ),
    )

    const pending = request('/home', { signal: controller.signal }).catch((error: unknown) => error)

    controller.abort(new Error('cancelled'))

    expect(await pending).not.toBeInstanceOf(ApiError)
  })
})
