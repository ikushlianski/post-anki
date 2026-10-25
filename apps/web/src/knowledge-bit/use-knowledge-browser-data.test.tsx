// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, renderHook, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import type { ReactNode } from 'react'

const list = vi.hoisted(() => vi.fn())

vi.mock('./knowledge-browser.api', () => ({
  listKnowledgeBrowser: list,
  listKnowledgeBrowserSubjectCounts: vi.fn(),
}))

import { useKnowledgeBrowserRows } from './use-knowledge-browser-data'

function wrapper({ children }: { children: ReactNode }) {
  return <QueryClientProvider client={new QueryClient()}>{children}</QueryClientProvider>
}

afterEach(() => {
  cleanup()
  list.mockReset()
})

describe('useKnowledgeBrowserRows', () => {
  it('should send the filters with the subject and report the total of matching pieces', async () => {
    list.mockResolvedValue({ ok: true, items: [], hasMore: false, total: 7 })

    const { result } = renderHook(
      () => useKnowledgeBrowserRows('s1', { question: 'pod', origins: ['article'], from: '2026-03-04' }),
      { wrapper },
    )

    await waitFor(() => expect(result.current.total).toBe(7))

    const sent = list.mock.calls[0][0].data

    expect(sent).toMatchObject({ subjectId: 's1', question: 'pod', origins: ['article'] })
    expect(sent.from).toContain('T')
  })

  it('should send no request while the date range is reversed', async () => {
    renderHook(() => useKnowledgeBrowserRows(null, { from: '2026-03-10', to: '2026-03-01' }), { wrapper })

    await new Promise((resolve) => setTimeout(resolve, 20))

    expect(list).not.toHaveBeenCalled()
  })
})
