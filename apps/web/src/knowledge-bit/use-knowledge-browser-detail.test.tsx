// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, renderHook, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import type { ReactNode } from 'react'

const detailApi = vi.hoisted(() => vi.fn())

vi.mock('./knowledge-browser-detail.api', () => ({ getKnowledgeBrowserDetail: detailApi }))

import { useKnowledgeBrowserDetail } from './use-knowledge-browser-detail'

function wrapper({ children }: { children: ReactNode }) {
  return <QueryClientProvider client={new QueryClient()}>{children}</QueryClientProvider>
}

afterEach(() => {
  cleanup()
  detailApi.mockReset()
})

describe('useKnowledgeBrowserDetail', () => {
  it('should ask for the piece by its own id and report it ready', async () => {
    detailApi.mockResolvedValue({ ok: true, detail: { knowledgeBitId: 'b9' } })

    const { result } = renderHook(() => useKnowledgeBrowserDetail('b9'), { wrapper })

    expect(result.current.status).toBe('pending')
    await waitFor(() => expect(result.current.status).toBe('ready'))
    expect(detailApi).toHaveBeenCalledWith({ data: { id: 'b9' } })
  })

  it('should report a piece the server does not know as missing, not as a failure', async () => {
    detailApi.mockResolvedValue({ ok: false, error: 'not_found' })

    const { result } = renderHook(() => useKnowledgeBrowserDetail('gone'), { wrapper })

    await waitFor(() => expect(result.current.status).toBe('missing'))
  })

  it('should report a failed load as an error the owner can retry', async () => {
    detailApi.mockResolvedValue({ ok: false, error: 'unknown' })

    const { result } = renderHook(() => useKnowledgeBrowserDetail('b9'), { wrapper })

    await waitFor(() => expect(result.current.status).toBe('error'))
  })
})
