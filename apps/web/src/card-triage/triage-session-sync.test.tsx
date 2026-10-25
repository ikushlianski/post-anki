// @vitest-environment jsdom
import { useState, type ReactNode } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'

import type { ReviewDecisions } from '../knowledge-bit/use-review-decisions'
import {
  deleteTriageDecision,
  discardTriageSession,
  finishTriageSession,
  listTriageDecisions,
  putTriageDecision,
  startTriageSession,
  type TriageOutcome,
} from './card-triage.api'
import { decisionRow, deferred, session } from './triage-session.test-helpers'
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
const mockedPut = vi.mocked(putTriageDecision)
const mockedDelete = vi.mocked(deleteTriageDecision)
const mockedDiscard = vi.mocked(discardTriageSession)
const mockedList = vi.mocked(listTriageDecisions)

function RecordingHarness() {
  const [decisions, setDecisions] = useState<ReviewDecisions>({})
  const triage = useTriageSession({ decisions })

  return (
    <div>
      <button
        type="button"
        onClick={() => {
          setDecisions({ b1: { verdict: 'approved', feedbackId: null } })
          triage.recordDecision('b1', 'approved', {})
        }}
      >
        record-approve
      </button>
      <button
        type="button"
        onClick={() => {
          setDecisions({ b1: { verdict: 'rejected', feedbackId: null } })
          triage.recordDecision('b1', 'rejected', {})
        }}
      >
        record-reject
      </button>
      <button
        type="button"
        onClick={() => {
          setDecisions({})
          triage.recordUndo('b1')
        }}
      >
        record-undo
      </button>
      <TriageSessionSection session={triage} />
    </div>
  )
}

describe('Triage session server sync', () => {
  beforeEach(() => {
    window.localStorage.clear()
    ;[mockedStart, mockedFinish, mockedPut, mockedDelete, mockedDiscard, mockedList].forEach((mock) =>
      mock.mockReset(),
    )
    mockedStart.mockResolvedValue({ ok: true, data: session() })
    mockedPut.mockResolvedValue({ ok: true, data: decisionRow('bit-1', 'approved') })
    mockedDelete.mockResolvedValue({ ok: true, data: decisionRow('bit-1', 'approved') })
    mockedDiscard.mockResolvedValue({ ok: true, data: session() })
    mockedList.mockResolvedValue({ ok: true, data: [] })
  })

  afterEach(() => {
    cleanup()
  })

  it('should show no notice when removing a decision from the server fails', async () => {
    mockedDelete.mockResolvedValue({ ok: false, error: 'boom', status: 500 })
    render(<RecordingHarness />)
    fireEvent.click(screen.getByRole('button', { name: 'Start triage' }))
    await screen.findByRole('button', { name: 'Finish triage' })
    fireEvent.click(screen.getByText('record-approve'))
    await waitFor(() => expect(mockedPut).toHaveBeenCalledTimes(1))
    fireEvent.click(screen.getByText('record-undo'))

    await waitFor(() => expect(mockedDelete).toHaveBeenCalledTimes(2))
    expect(screen.queryByTestId('triage-sync-notice')).toBeNull()
    expect(screen.getByTestId('triage-counts').textContent).toContain('0 decided')
  })

  it('should drop the not-saved notice once the unsaved decision is undone', async () => {
    mockedPut.mockResolvedValue({ ok: false, error: 'boom', status: 500 })
    render(<RecordingHarness />)
    fireEvent.click(screen.getByRole('button', { name: 'Start triage' }))
    await screen.findByRole('button', { name: 'Finish triage' })
    fireEvent.click(screen.getByText('record-approve'))
    await screen.findByTestId('triage-sync-notice')
    fireEvent.click(screen.getByText('record-undo'))

    await waitFor(() => expect(screen.queryByTestId('triage-sync-notice')).toBeNull())
  })

  it('should not carry a failed-decision notice into the next session', async () => {
    mockedPut.mockResolvedValue({ ok: false, error: 'boom', status: 500 })
    mockedFinish.mockResolvedValue({ ok: false, error: 'gone', status: 409 })
    render(<RecordingHarness />)
    fireEvent.click(screen.getByRole('button', { name: 'Start triage' }))
    await screen.findByRole('button', { name: 'Finish triage' })
    fireEvent.click(screen.getByText('record-approve'))
    await screen.findByTestId('triage-sync-notice')
    fireEvent.click(screen.getByRole('button', { name: 'Finish triage' }))
    fireEvent.click(screen.getByRole('button', { name: 'Skip' }))
    await screen.findByTestId('triage-feedback-error')
    fireEvent.click(screen.getByRole('button', { name: 'Skip' }))
    fireEvent.click(await screen.findByRole('button', { name: 'Discard this session' }))
    fireEvent.click(screen.getByRole('button', { name: 'Start triage' }))
    await screen.findByRole('button', { name: 'Finish triage' })

    expect(screen.queryByTestId('triage-sync-notice')).toBeNull()
  })

  it.each([404, 409])('should not retry a removal the server answers %i', async (status) => {
    mockedDelete.mockResolvedValue({ ok: false, error: 'gone', status })
    render(<RecordingHarness />)
    fireEvent.click(screen.getByRole('button', { name: 'Start triage' }))
    await screen.findByRole('button', { name: 'Finish triage' })
    fireEvent.click(screen.getByText('record-approve'))
    await waitFor(() => expect(mockedPut).toHaveBeenCalledTimes(1))
    fireEvent.click(screen.getByText('record-undo'))

    await waitFor(() => expect(mockedDelete).toHaveBeenCalledTimes(1))
    expect(screen.queryByTestId('triage-sync-notice')).toBeNull()
  })

  it('should retry a failed removal once because the finish payload cannot undo a decision', async () => {
    mockedDelete.mockResolvedValueOnce({ ok: false, error: 'boom', status: 500 })
    render(<RecordingHarness />)
    fireEvent.click(screen.getByRole('button', { name: 'Start triage' }))
    await screen.findByRole('button', { name: 'Finish triage' })
    fireEvent.click(screen.getByText('record-approve'))
    await waitFor(() => expect(mockedPut).toHaveBeenCalledTimes(1))
    fireEvent.click(screen.getByText('record-undo'))

    await waitFor(() => expect(mockedDelete).toHaveBeenCalledTimes(2))
  })

  it('should ignore a decision save that answers after the session was discarded and a new one started', async () => {
    const slow = deferred<TriageOutcome<ReturnType<typeof decisionRow>>>()

    mockedPut.mockReturnValueOnce(slow.promise)
    mockedFinish.mockResolvedValue({ ok: false, error: 'gone', status: 409 })
    render(<RecordingHarness />)
    fireEvent.click(screen.getByRole('button', { name: 'Start triage' }))
    await screen.findByRole('button', { name: 'Finish triage' })
    fireEvent.click(screen.getByText('record-approve'))
    fireEvent.click(screen.getByText('record-undo'))
    fireEvent.click(screen.getByRole('button', { name: 'Finish triage' }))
    fireEvent.click(screen.getByRole('button', { name: 'Skip' }))
    fireEvent.click(await screen.findByRole('button', { name: 'Discard this session' }))
    fireEvent.click(screen.getByRole('button', { name: 'Start triage' }))
    await screen.findByRole('button', { name: 'Finish triage' })

    await act(async () => {
      slow.resolve({ ok: false, error: 'boom', status: 500 })
    })

    expect(screen.queryByTestId('triage-sync-notice')).toBeNull()
  })

  it('should send an edit made while the previous save was still in flight', async () => {
    const slow = deferred<TriageOutcome<ReturnType<typeof decisionRow>>>()

    mockedPut.mockReturnValueOnce(slow.promise)
    mockedFinish.mockResolvedValue({ ok: true, data: session({ status: 'saved_text_only' }) })
    render(<RecordingHarness />)
    fireEvent.click(screen.getByRole('button', { name: 'Start triage' }))
    await screen.findByRole('button', { name: 'Finish triage' })
    fireEvent.click(screen.getByText('record-reject'))
    fireEvent.click(screen.getByRole('button', { name: 'Finish triage' }))
    fireEvent.change(await screen.findByTestId('triage-decision-note-b1'), { target: { value: 'edited' } })

    await act(async () => {
      slow.resolve({ ok: true, data: decisionRow('b1', 'rejected') })
    })
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))

    await screen.findByTestId('triage-result')
    expect(mockedPut).toHaveBeenLastCalledWith({
      data: expect.objectContaining({ bitId: 'b1', note: 'edited' }),
    })
  })
})
