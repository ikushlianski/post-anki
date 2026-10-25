// @vitest-environment jsdom
import type { ReactNode } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import type { TriageSessionResponse } from '@post-anki/shared'

import {
  discardTriageSession,
  finishTriageSession,
  listTriageDecisions,
  putTriageDecision,
  startTriageSession,
} from './card-triage.api'
import { TriageSessionSection } from './triage-session-section'
import { useTriageSession } from './use-triage-session'

vi.mock('@tanstack/react-router', () => ({
  Link: ({ to, children }: { to: string; children: ReactNode }) => <a href={to}>{children}</a>,
}))

vi.mock('./card-triage.api', () => ({
  startTriageSession: vi.fn(),
  finishTriageSession: vi.fn(),
  discardTriageSession: vi.fn(),
  putTriageDecision: vi.fn(),
  deleteTriageDecision: vi.fn(),
  listTriageDecisions: vi.fn(),
}))

const mockedStart = vi.mocked(startTriageSession)
const mockedFinish = vi.mocked(finishTriageSession)
const mockedDiscard = vi.mocked(discardTriageSession)
const STORAGE_KEY = 'post-anki:open-triage-session'
const DECISIONS_KEY = 'post-anki:open-triage-session-decisions'

function session(id = 's1'): TriageSessionResponse {
  return {
    id,
    subjectId: null,
    status: 'open',
    startedAt: '2026-10-24T10:00:00.000Z',
    endedAt: null,
    acceptedCount: 0,
    rejectedCount: 0,
    feedbackText: null,
    notes: [],
  }
}

function startKeys(): string[] {
  return mockedStart.mock.calls.map(([arg]) => (arg as { data: { startKey: string } }).data.startKey)
}

function Harness({ subjectId = null }: { subjectId?: string | null }) {
  const triage = useTriageSession({ decisions: {}, subjectId })

  return <TriageSessionSection session={triage} />
}

describe('triage session recovery', () => {
  beforeEach(() => {
    window.localStorage.clear()
    mockedStart.mockReset()
    mockedFinish.mockReset()
    mockedDiscard.mockReset()
    mockedDiscard.mockResolvedValue({ ok: true, data: session() })
    vi.mocked(putTriageDecision).mockReset()
    vi.mocked(putTriageDecision).mockResolvedValue({ ok: false, error: 'unused' })
    vi.mocked(listTriageDecisions).mockReset()
    vi.mocked(listTriageDecisions).mockResolvedValue({ ok: true, data: [] })
    mockedStart.mockResolvedValue({ ok: true, data: session() })
  })

  afterEach(() => {
    cleanup()
  })

  it.each([404, 409])(
    'should let the user discard a stored session the server answers %i for and start fresh',
    async (status) => {
      window.localStorage.setItem(STORAGE_KEY, 'old')
      mockedFinish.mockResolvedValue({ ok: false, error: 'gone', status })
      render(<Harness />)

      fireEvent.click(await screen.findByRole('button', { name: 'Finish triage' }))
      fireEvent.click(screen.getByRole('button', { name: 'Skip' }))
      fireEvent.click(await screen.findByRole('button', { name: 'Discard this session' }))

      expect(screen.getByRole('button', { name: 'Start triage' })).toBeTruthy()
      expect(window.localStorage.getItem(STORAGE_KEY)).toBeNull()
    },
  )

  it('should not offer discard when saving fails for a temporary reason', async () => {
    window.localStorage.setItem(STORAGE_KEY, 'old')
    mockedFinish.mockResolvedValue({ ok: false, error: 'boom', status: 500 })
    render(<Harness />)

    fireEvent.click(await screen.findByRole('button', { name: 'Finish triage' }))
    fireEvent.click(screen.getByRole('button', { name: 'Skip' }))

    await screen.findByTestId('triage-feedback-error')
    expect(screen.queryByRole('button', { name: 'Discard this session' })).toBeNull()
  })

  it('should say plainly that decisions made before a reload are still counted', async () => {
    window.localStorage.setItem(STORAGE_KEY, 'old')
    render(<Harness />)

    expect((await screen.findByTestId('triage-resumed')).textContent).toContain('still counted')
    fireEvent.click(screen.getByRole('button', { name: 'Finish triage' }))
    expect(screen.getByTestId('triage-feedback-resumed').textContent).toContain('still counted')
  })

  it('should send decisions made before a reload when the reopened session is finished', async () => {
    window.localStorage.setItem(STORAGE_KEY, 'old')
    window.localStorage.setItem(
      DECISIONS_KEY,
      JSON.stringify({
        sessionId: 'old',
        decisions: [
          { bitId: 'b1', verdict: 'approved' },
          { bitId: 'b2', verdict: 'rejected' },
        ],
      }),
    )
    mockedFinish.mockResolvedValue({ ok: true, data: session('old') })
    render(<Harness />)

    expect((await screen.findByTestId('triage-counts')).textContent).toContain('2 decided')
    fireEvent.click(screen.getByRole('button', { name: 'Finish triage' }))
    fireEvent.click(screen.getByRole('button', { name: 'Skip' }))
    await screen.findByRole('button', { name: 'Start triage' })

    expect(mockedFinish).toHaveBeenCalledWith({
      data: {
        sessionId: 'old',
        feedbackText: '',
        decisions: [
          { bitId: 'b1', verdict: 'approved' },
          { bitId: 'b2', verdict: 'rejected' },
        ],
      },
    })
    expect(window.localStorage.getItem(DECISIONS_KEY)).toBeNull()
  })

  it('should ignore stored decisions that belong to a different session', async () => {
    window.localStorage.setItem(STORAGE_KEY, 'new')
    window.localStorage.setItem(
      DECISIONS_KEY,
      JSON.stringify({ sessionId: 'other', decisions: [{ bitId: 'b1', verdict: 'approved' }] }),
    )
    render(<Harness />)

    expect((await screen.findByTestId('triage-counts')).textContent).toContain('0 decided')
  })

  it('should start a session for the subject id of the on-screen cards', async () => {
    render(<Harness subjectId="sub-1" />)

    fireEvent.click(screen.getByRole('button', { name: 'Start triage' }))
    await screen.findByRole('button', { name: 'Finish triage' })

    expect(mockedStart).toHaveBeenCalledWith({
      data: { subjectId: 'sub-1', client: 'web', startKey: expect.any(String) },
    })
  })

  it('should start a global session when the on-screen cards have no single subject', async () => {
    render(<Harness subjectId={null} />)

    fireEvent.click(screen.getByRole('button', { name: 'Start triage' }))
    await screen.findByRole('button', { name: 'Finish triage' })

    expect(mockedStart).toHaveBeenCalledWith({
      data: { subjectId: null, client: 'web', startKey: expect.any(String) },
    })
  })

  it('should reuse the same start key when a failed start is retried so no second session is made', async () => {
    mockedStart.mockResolvedValueOnce({ ok: false, error: 'network' })
    render(<Harness />)

    fireEvent.click(screen.getByRole('button', { name: 'Start triage' }))
    await screen.findByText("Couldn't start triage. Try again.")
    fireEvent.click(screen.getByRole('button', { name: 'Start triage' }))
    await screen.findByRole('button', { name: 'Finish triage' })

    const keys = startKeys()

    expect(keys).toHaveLength(2)
    expect(keys[0]).toBeTruthy()
    expect(keys[1]).toBe(keys[0])
  })

  it('should use a fresh start key for the next session after a successful start', async () => {
    mockedFinish.mockResolvedValue({ ok: true, data: session() })
    render(<Harness />)

    fireEvent.click(screen.getByRole('button', { name: 'Start triage' }))
    fireEvent.click(await screen.findByRole('button', { name: 'Finish triage' }))
    fireEvent.click(screen.getByRole('button', { name: 'Skip' }))

    await screen.findByRole('button', { name: 'Start triage' })
    fireEvent.click(screen.getByRole('button', { name: 'Start triage' }))
    await screen.findByRole('button', { name: 'Finish triage' })

    const [first, second] = startKeys()

    expect(second).not.toBe(first)
  })

  it('should record the discard on the server and still clear locally when the server says gone', async () => {
    window.localStorage.setItem(STORAGE_KEY, 'old')
    mockedFinish.mockResolvedValue({ ok: false, error: 'gone', status: 409 })
    mockedDiscard.mockResolvedValue({ ok: false, error: 'already_finished', status: 409 })
    render(<Harness />)

    fireEvent.click(await screen.findByRole('button', { name: 'Finish triage' }))
    fireEvent.click(screen.getByRole('button', { name: 'Skip' }))
    fireEvent.click(await screen.findByRole('button', { name: 'Discard this session' }))

    await waitFor(() =>
      expect(mockedDiscard).toHaveBeenCalledWith({ data: { sessionId: 'old' } }),
    )
    expect(screen.getByRole('button', { name: 'Start triage' })).toBeTruthy()
    expect(window.localStorage.getItem(STORAGE_KEY)).toBeNull()
  })

  it('should still clear the local session when the discard call throws', async () => {
    window.localStorage.setItem(STORAGE_KEY, 'old')
    mockedFinish.mockResolvedValue({ ok: false, error: 'gone', status: 404 })
    mockedDiscard.mockRejectedValue(new Error('offline'))
    render(<Harness />)

    fireEvent.click(await screen.findByRole('button', { name: 'Finish triage' }))
    fireEvent.click(screen.getByRole('button', { name: 'Skip' }))
    fireEvent.click(await screen.findByRole('button', { name: 'Discard this session' }))

    expect(screen.getByRole('button', { name: 'Start triage' })).toBeTruthy()
    expect(window.localStorage.getItem(STORAGE_KEY)).toBeNull()
  })
})
