// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import type { TriageHistoryItem, TriageHistoryResponse } from '@post-anki/shared'

import { listRecentTriageDecisions, patchTriageDecision } from './triage-history.api'
import { TriageHistoryPage } from './triage-history-page'

vi.mock('./triage-history.api', () => ({
  listRecentTriageDecisions: vi.fn(),
  patchTriageDecision: vi.fn(),
}))

const mockedList = vi.mocked(listRecentTriageDecisions)
const mockedPatch = vi.mocked(patchTriageDecision)

const ITEM: TriageHistoryItem = {
  id: 'ctd_1',
  sessionId: 'cts_1',
  bitId: 'kb_1',
  verdict: 'rejected',
  reasonCode: null,
  note: null,
  decidedAt: '2026-11-01T10:00:00.000Z',
  front: 'What is a TTL?',
  back: 'Time to live',
  subjectType: 'programming',
  rejectReasonCodes: ['too_trivial', 'other'],
  extractionModelId: 'model-x',
  fusionModelIds: [],
  score: null,
  matchedBy: null,
}

function response(overrides: Partial<TriageHistoryResponse> = {}): { ok: true; data: TriageHistoryResponse } {
  return { ok: true, data: { days: 7, mode: 'both', meaningUnavailable: false, decisions: [ITEM], ...overrides } }
}

function renderPage() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })

  return render(
    <QueryClientProvider client={client}>
      <TriageHistoryPage />
    </QueryClientProvider>,
  )
}

describe('TriageHistoryPage', () => {
  beforeEach(() => {
    mockedList.mockReset()
    mockedPatch.mockReset()
    mockedList.mockResolvedValue(response())
  })

  afterEach(() => {
    cleanup()
  })

  it('should flag a rejection saved without a reason so the owner can fill it in later', async () => {
    renderPage()

    expect(await screen.findByTestId('triage-history-no-reason-ctd_1')).toBeTruthy()
    expect(screen.getByTestId('triage-history-verdict-ctd_1').textContent).toBe('Rejected')
  })

  it('should save the chosen reason on that decision and drop the no-reason flag', async () => {
    mockedPatch.mockResolvedValue({
      ok: true,
      data: {
        id: 'ctd_1',
        sessionId: 'cts_1',
        bitId: 'kb_1',
        verdict: 'rejected',
        reasonCode: 'too_trivial',
        note: null,
        decidedAt: ITEM.decidedAt,
        orderIndex: 0,
        dwellMs: null,
        front: ITEM.front,
        back: ITEM.back,
        variants: [],
        undoneAt: null,
        source: 'client',
      },
    })
    renderPage()

    fireEvent.click(await screen.findByTestId('triage-history-reason-ctd_1-too_trivial'))

    await waitFor(() => expect(screen.queryByTestId('triage-history-no-reason-ctd_1')).toBeNull())
    expect(mockedPatch).toHaveBeenCalledWith({ data: { decisionId: 'ctd_1', reasonCode: 'too_trivial' } })
    expect(screen.getByTestId('triage-history-reason-ctd_1-too_trivial').getAttribute('aria-pressed')).toBe('true')
  })

  it('should search the week by the typed words using the chosen mode', async () => {
    renderPage()
    await screen.findByTestId('triage-history-ctd_1')

    fireEvent.change(screen.getByTestId('triage-history-mode'), { target: { value: 'meaning' } })
    fireEvent.change(screen.getByTestId('triage-history-search'), { target: { value: 'expiry' } })

    await waitFor(() =>
      expect(mockedList).toHaveBeenLastCalledWith({ data: { days: 7, q: 'expiry', mode: 'meaning' } }),
    )
  })

  it('should say when meaning search was unavailable and only words were used', async () => {
    mockedList.mockResolvedValue(response({ meaningUnavailable: true, mode: 'text' }))
    renderPage()

    expect(await screen.findByTestId('triage-history-meaning-unavailable')).toBeTruthy()
  })

  it('should show an empty message when nothing was decided this week', async () => {
    mockedList.mockResolvedValue(response({ decisions: [] }))
    renderPage()

    expect((await screen.findByTestId('triage-history-empty')).textContent).toContain('last 7 days')
  })
})
