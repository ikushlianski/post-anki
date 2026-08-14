// @vitest-environment jsdom
import { Suspense } from 'react'
import type { ReactNode } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'

import type { StructureTurn } from '@post-anki/shared'
import { CurriculumStructureChat } from './curriculum-structure-chat'
import { confirmStructure, getStructureTurns, resolveSupplementalResearch, retryDraftStructure, submitStructureTurn } from './curriculum.api'

const invalidate = vi.fn().mockResolvedValue(undefined)

vi.mock('@tanstack/react-router', () => ({
  useRouter: () => ({ invalidate }),
  Link: ({ children }: { children: ReactNode }) => <a href="#">{children}</a>,
}))

vi.mock('./curriculum.api', () => ({
  confirmStructure: vi.fn(),
  getStructureTurns: vi.fn(),
  resolveSupplementalResearch: vi.fn(),
  retryDraftStructure: vi.fn(),
  submitStructureTurn: vi.fn(),
}))

const mockedGetStructureTurns = vi.mocked(getStructureTurns)
const mockedRetryDraftStructure = vi.mocked(retryDraftStructure)

const CURRICULUM_ID = 'cur_1'

function turn(overrides: Partial<StructureTurn> = {}): StructureTurn {
  return {
    id: 'turn_1',
    curriculumId: CURRICULUM_ID,
    role: 'user',
    message: 'hello',
    structureSnapshot: null,
    splitSuggestion: null,
    toolActions: [],
    status: 'complete',
    pendingResearchCandidates: [],
    createdAt: new Date().toISOString(),
    ...overrides,
  }
}

function renderChat() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })

  return render(
    <QueryClientProvider client={queryClient}>
      <Suspense fallback={null}>
        <CurriculumStructureChat curriculumId={CURRICULUM_ID} />
      </Suspense>
    </QueryClientProvider>,
  )
}

describe('CurriculumStructureChat drafting window', () => {
  beforeEach(() => {
    invalidate.mockClear()
    mockedGetStructureTurns.mockReset()
    mockedRetryDraftStructure.mockReset()
    vi.mocked(confirmStructure).mockReset()
    vi.mocked(resolveSupplementalResearch).mockReset()
    vi.mocked(submitStructureTurn).mockReset()
  })

  afterEach(() => {
    cleanup()
    vi.useRealTimers()
  })

  it('shows the drafting placeholder — never the source-approval warning — even with an empty turn list', async () => {
    mockedGetStructureTurns.mockResolvedValue([])

    renderChat()

    const pending = await screen.findByTestId('structure-draft-pending')

    expect(pending.textContent).toContain('Drafting the first version of the structure…')
    expect(screen.queryByTestId('source-approval-empty')).toBeNull()
  })

  it('does not mistake a live pending draft turn for a crashed one, and withholds the composer and build button', async () => {
    mockedGetStructureTurns.mockResolvedValue([
      turn({ id: 't1', role: 'assistant', status: 'pending', createdAt: new Date().toISOString() }),
    ])

    renderChat()

    await screen.findByTestId('structure-draft-pending')

    expect(screen.queryByTestId('structure-turn-resend')).toBeNull()
    expect(screen.queryByText("That reply didn’t come through.")).toBeNull()
    expect(screen.queryByTestId('structure-chat-input')).toBeNull()
    expect(screen.queryByTestId('structure-chat-send')).toBeNull()
    expect(screen.queryByTestId('structure-chat-confirm')).toBeNull()
  })

  it('still shows the resend affordance for a genuinely stale pending turn once a snapshot already exists', async () => {
    mockedGetStructureTurns.mockResolvedValue([
      turn({
        id: 't1',
        role: 'assistant',
        status: 'complete',
        structureSnapshot: { modules: [], strictOrder: false },
      }),
      turn({ id: 't2', role: 'user', message: 'tweak module two' }),
      turn({
        id: 't3',
        role: 'assistant',
        status: 'pending',
        createdAt: new Date(Date.now() - 10 * 60 * 1000).toISOString(),
      }),
    ])

    renderChat()

    expect(await screen.findByTestId('structure-turn-resend')).toBeTruthy()
  })

  it('brings back the composer, send and confirm controls once a snapshot exists', async () => {
    mockedGetStructureTurns.mockResolvedValue([
      turn({
        id: 't1',
        role: 'assistant',
        status: 'complete',
        structureSnapshot: { modules: [], strictOrder: false },
      }),
    ])

    renderChat()

    expect(await screen.findByTestId('structure-chat-input')).toBeTruthy()
    expect(screen.getByTestId('structure-chat-send')).toBeTruthy()
    expect(screen.getByTestId('structure-chat-confirm')).toBeTruthy()
  })

  it('swaps to a longer-than-expected message with a working retry once the draft is stalled', async () => {
    mockedGetStructureTurns.mockResolvedValue([
      turn({
        id: 't1',
        role: 'assistant',
        status: 'pending',
        createdAt: new Date(Date.now() - 10 * 60 * 1000).toISOString(),
      }),
    ])
    mockedRetryDraftStructure.mockResolvedValue(null)

    renderChat()

    const pending = await screen.findByTestId('structure-draft-pending')

    expect(pending.textContent).toContain('This is taking longer than expected')
    expect(screen.queryByTestId('structure-chat-input')).toBeNull()

    await act(async () => {
      fireEvent.click(screen.getByTestId('structure-draft-retry'))
    })

    expect(mockedRetryDraftStructure).toHaveBeenCalledWith({ data: CURRICULUM_ID })
  })

  it('refreshes on a 2500ms interval while mounted and stops once unmounted', async () => {
    mockedGetStructureTurns.mockResolvedValue([])
    vi.useFakeTimers()

    const { unmount } = renderChat()

    await act(async () => {
      await vi.advanceTimersByTimeAsync(0)
    })

    expect(screen.getByTestId('structure-draft-pending')).toBeTruthy()

    await act(async () => {
      await vi.advanceTimersByTimeAsync(2500)
    })
    expect(invalidate).toHaveBeenCalledTimes(1)

    await act(async () => {
      await vi.advanceTimersByTimeAsync(2500)
    })
    expect(invalidate).toHaveBeenCalledTimes(2)

    unmount()

    await act(async () => {
      await vi.advanceTimersByTimeAsync(5000)
    })
    expect(invalidate).toHaveBeenCalledTimes(2)
  })
})
