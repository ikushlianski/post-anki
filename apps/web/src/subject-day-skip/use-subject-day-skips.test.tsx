// @vitest-environment jsdom
import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest'
import { cleanup, renderHook, waitFor, act } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import type { ReactNode } from 'react'

import { getSubjectDaySkips, setSubjectDaySkip } from './subject-day-skips.api'
import { SUBJECT_DAY_SKIPS_KEY, useSubjectDaySkips, useToggleSubjectDaySkip } from './use-subject-day-skips'

vi.mock('./subject-day-skips.api', () => ({ getSubjectDaySkips: vi.fn(), setSubjectDaySkip: vi.fn() }))
vi.mock('../shared/browser-time-zone', () => ({ browserTimeZone: () => 'UTC' }))
vi.mock('../review-offline/default-offline-store', () => ({ getOfflineStore: vi.fn() }))
vi.mock('../review-offline/send-queued-grade', () => ({ downloadReviewPack: vi.fn() }))
vi.mock('../review-offline/review-pack', () => ({ refreshStoredPack: vi.fn().mockResolvedValue(true) }))

const DAY = { dayKey: '2026-11-22', subjectIds: ['a'] }

function setup() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  )

  return { client, wrapper }
}

describe('subject day skips', () => {
  beforeEach(() => {
    vi.mocked(getSubjectDaySkips).mockResolvedValue(DAY)
  })
  afterEach(() => {
    cleanup()
    vi.clearAllMocks()
  })

  it('should list the subjects skipped for today', async () => {
    const { wrapper } = setup()
    const { result } = renderHook(() => useSubjectDaySkips(), { wrapper })

    await waitFor(() => expect(result.current.has('a')).toBe(true))
  })

  it('should show a subject as skipped at once and refresh review data after the server confirms', async () => {
    const { client, wrapper } = setup()
    const invalidate = vi.spyOn(client, 'invalidateQueries')

    client.setQueryData(SUBJECT_DAY_SKIPS_KEY, DAY)
    vi.mocked(setSubjectDaySkip).mockResolvedValue({ dayKey: DAY.dayKey, subjectIds: ['a', 'b'] })

    const { result } = renderHook(() => useToggleSubjectDaySkip(), { wrapper })

    await act(async () => {
      await result.current.mutateAsync({ subjectId: 'b', skipped: true })
    })

    expect(vi.mocked(setSubjectDaySkip).mock.calls[0]?.[0]).toEqual({ data: { subjectId: 'b', skipped: true, tz: 'UTC' } })
    expect(client.getQueryData(SUBJECT_DAY_SKIPS_KEY)).toEqual({ dayKey: DAY.dayKey, subjectIds: ['a', 'b'] })

    const keys = invalidate.mock.calls.map((call) => call[0]?.queryKey)

    expect(keys).toContainEqual(['anki-review-queue'])
    expect(keys).toContainEqual(['subjects', 'review-due-counts'])
  })

  it('should put the subject back as it was when the server rejects the change', async () => {
    const { client, wrapper } = setup()

    client.setQueryData(SUBJECT_DAY_SKIPS_KEY, DAY)
    vi.mocked(setSubjectDaySkip).mockRejectedValue(new Error('boom'))

    const { result } = renderHook(() => useToggleSubjectDaySkip(), { wrapper })

    await act(async () => {
      await result.current.mutateAsync({ subjectId: 'a', skipped: false }).catch(() => undefined)
    })

    expect(client.getQueryData<typeof DAY>(SUBJECT_DAY_SKIPS_KEY)?.subjectIds).toContain('a')
  })
})
