// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { cleanup, render, screen, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'

import type { PhraseBankEntry, PhraseBankSummary } from '@post-anki/shared'

import { PhraseBankPanel } from './phrase-bank-panel'
import { getPhraseBank } from './phrase-bank.api'

vi.mock('./phrase-bank.api', () => ({
  getPhraseBank: vi.fn(),
}))

const mockedGetPhraseBank = vi.mocked(getPhraseBank)

function makeEntry(overrides: Partial<PhraseBankEntry> = {}): PhraseBankEntry {
  return {
    id: 'pbentry-1',
    subjectId: 'subj-1',
    level: 'B1_B2',
    pack: 'General',
    phraseText: 'get to the bottom of',
    category: 'idiom',
    status: 'practicing',
    masteryStage: 1,
    correctCountInCycle: 1,
    incorrectCountInCycle: 0,
    lastCorrectAtSentenceCount: 5,
    lastCorrectDate: '2026-07-25T00:00:00.000Z',
    scheduledForSentenceCount: 8,
    notes: null,
    createdAt: '2026-07-20T00:00:00.000Z',
    updatedAt: '2026-07-25T00:00:00.000Z',
    masteredAt: null,
    ...overrides,
  }
}

function renderPanel(summary: PhraseBankSummary) {
  mockedGetPhraseBank.mockResolvedValue(summary)

  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })

  return render(
    <QueryClientProvider client={queryClient}>
      <PhraseBankPanel subjectId="subj-1" />
    </QueryClientProvider>,
  )
}

describe('PhraseBankPanel', () => {
  beforeEach(() => {
    mockedGetPhraseBank.mockReset()
  })

  afterEach(() => {
    cleanup()
  })

  it('renders the panel testid once the summary loads', async () => {
    renderPanel({ active: [], mastered: [] })

    await waitFor(() => expect(screen.getByTestId('phrase-bank-panel')).toBeDefined())
  })

  it('lists an active entry under the active group with its status', async () => {
    const entry = makeEntry({ id: 'pbentry-active', status: 'struggling' })
    renderPanel({ active: [entry], mastered: [] })

    await waitFor(() => expect(screen.getByTestId('phrase-bank-active')).toBeDefined())
    expect(screen.getByTestId('phrase-bank-entry-pbentry-active').textContent).toContain(
      'get to the bottom of',
    )
    expect(screen.getByTestId('phrase-bank-entry-status-pbentry-active').textContent).toBe(
      'Struggling',
    )
  })

  it('lists a mastered entry under the mastered group, not the active group', async () => {
    const entry = makeEntry({ id: 'pbentry-mastered', status: 'mastered', masteredAt: '2026-07-25T00:00:00.000Z' })
    renderPanel({ active: [], mastered: [entry] })

    await waitFor(() => expect(screen.getByTestId('phrase-bank-mastered')).toBeDefined())
    expect(screen.queryByTestId('phrase-bank-active')).toBeNull()
    expect(screen.getByTestId('phrase-bank-entry-status-pbentry-mastered').textContent).toBe(
      'Mastered',
    )
  })

  it('shows an empty-state message when nothing is tracked yet', async () => {
    renderPanel({ active: [], mastered: [] })

    await waitFor(() => expect(screen.getByTestId('phrase-bank-empty')).toBeDefined())
  })
})
