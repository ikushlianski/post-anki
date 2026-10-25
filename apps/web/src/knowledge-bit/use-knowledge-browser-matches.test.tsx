// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, renderHook, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import type { ReactNode } from 'react'

const matchesApi = vi.hoisted(() => vi.fn())

vi.mock('./knowledge-browser-matches.api', () => ({ getKnowledgeBrowserMatches: matchesApi }))
vi.mock('./knowledge-browser.api', () => ({
  listKnowledgeBrowser: vi.fn(),
  listKnowledgeBrowserSubjectCounts: vi.fn(),
}))

import { useKnowledgeBrowserMatches } from './use-knowledge-browser-matches'

function wrapper({ children }: { children: ReactNode }) {
  return <QueryClientProvider client={new QueryClient()}>{children}</QueryClientProvider>
}

afterEach(() => {
  cleanup()
  matchesApi.mockReset()
})

describe('useKnowledgeBrowserMatches', () => {
  it('should make no request while there are no meaning words', async () => {
    const { result } = renderHook(() => useKnowledgeBrowserMatches(undefined, null, {}), { wrapper })

    await new Promise((resolve) => setTimeout(resolve, 20))

    expect(matchesApi).not.toHaveBeenCalled()
    expect(result.current.status).toBe('off')
    expect(result.current.active).toBe(false)
  })

  it('should send the words with the subject and the current filters and keep the closest-first order', async () => {
    matchesApi.mockResolvedValue({
      ok: true,
      items: [{ knowledgeBitId: 'a', similarity: 0.9 }, { knowledgeBitId: 'b', similarity: 0.5 }],
      readyCount: 6,
      notReadyCount: 2,
      capped: true,
    })

    const { result } = renderHook(
      () => useKnowledgeBrowserMatches('heart', 's1', { origins: ['notion'], from: '2026-03-04' }),
      { wrapper },
    )

    await waitFor(() => expect(result.current.status).toBe('success'))

    const sent = matchesApi.mock.calls[0][0].data

    expect(sent).toMatchObject({ q: 'heart', subjectId: 's1', origins: ['notion'] })
    expect(sent.from).toContain('T')
    expect(result.current.rows.map((row) => row.knowledgeBitId)).toEqual(['a', 'b'])
    expect(result.current).toMatchObject({ readyCount: 6, notReadyCount: 2, capped: true })
  })

  it('should not repeat a refused search on its own', async () => {
    matchesApi.mockResolvedValue({ ok: false, error: 'search_rate_limited' })

    const { result } = renderHook(() => useKnowledgeBrowserMatches('heart', null, {}), { wrapper })

    await waitFor(() => expect(result.current.status).toBe('error'))
    await new Promise((resolve) => setTimeout(resolve, 50))

    expect(matchesApi).toHaveBeenCalledOnce()
    expect(result.current.errorCode).toBe('search_rate_limited')
  })

  it('should search again only when the owner retries', async () => {
    matchesApi.mockResolvedValueOnce({ ok: false, error: 'embedding_failed' })
    matchesApi.mockResolvedValueOnce({ ok: true, items: [], readyCount: 1, notReadyCount: 0, capped: false })

    const { result } = renderHook(() => useKnowledgeBrowserMatches('heart', null, {}), { wrapper })

    await waitFor(() => expect(result.current.status).toBe('error'))

    result.current.retry()

    await waitFor(() => expect(result.current.status).toBe('success'))

    expect(matchesApi).toHaveBeenCalledTimes(2)
  })

  it('should send no request while the date range is reversed', async () => {
    const { result } = renderHook(
      () => useKnowledgeBrowserMatches('heart', null, { from: '2026-03-10', to: '2026-03-01' }),
      { wrapper },
    )

    await new Promise((resolve) => setTimeout(resolve, 20))

    expect(matchesApi).not.toHaveBeenCalled()
    expect(result.current.status).toBe('blocked')
  })
})
