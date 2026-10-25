// @vitest-environment jsdom
import type { ReactNode } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'

import {
  deleteTriageDecision,
  discardTriageSession,
  finishTriageSession,
  listTriageDecisions,
  putTriageDecision,
  startTriageSession,
  type TriageOutcome,
} from './card-triage.api'
import { Harness, decisionRow, deferred, session, startSession } from './triage-session.test-helpers'

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

describe('Triage session decisions', () => {
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

  it('should send the number of cards left undecided when the session is finished', async () => {
    mockedFinish.mockResolvedValue({ ok: true, data: session({ status: 'distilled' }) })
    render(<Harness undecidedCount={7} />)
    await startSession()
    fireEvent.click(screen.getByRole('button', { name: 'Finish triage' }))
    fireEvent.click(screen.getByRole('button', { name: 'Skip' }))
    await screen.findByRole('button', { name: 'Start triage' })

    expect(mockedFinish).toHaveBeenCalledWith({
      data: { sessionId: 's1', feedbackText: '', decisions: [], undecidedCount: 7 },
    })
  })

  it('should list this session decisions on the finish screen with rejected open and accepted collapsed', async () => {
    mockedList.mockResolvedValue({
      ok: true,
      data: [decisionRow('bit-1', 'approved'), decisionRow('bit-2', 'rejected')],
    })
    render(<Harness />)
    await startSession()
    fireEvent.click(screen.getByText('decide-approve'))
    fireEvent.click(screen.getByText('decide-reject'))
    fireEvent.click(screen.getByRole('button', { name: 'Finish triage' }))

    await screen.findByText('Front bit-2')
    expect(screen.getByTestId('triage-decisions-rejected').hasAttribute('open')).toBe(true)
    expect(screen.getByTestId('triage-decisions-accepted').hasAttribute('open')).toBe(false)
    expect(mockedList).toHaveBeenCalledWith({ data: { sessionId: 's1' } })
  })

  it('should save a note and reason edited on the finish screen before closing the session', async () => {
    mockedFinish.mockResolvedValue({ ok: true, data: session({ status: 'saved_text_only' }) })
    render(<Harness />)
    await startSession()
    fireEvent.click(screen.getByText('decide-reject'))
    fireEvent.click(screen.getByRole('button', { name: 'Finish triage' }))

    fireEvent.change(screen.getByTestId('triage-decision-note-bit-1'), {
      target: { value: 'odd blank' },
    })
    fireEvent.click(screen.getByTestId('triage-decision-reason-bit-1-bad_format'))
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))

    await screen.findByTestId('triage-result')
    expect(mockedPut).toHaveBeenCalledWith({
      data: {
        sessionId: 's1',
        bitId: 'bit-1',
        verdict: 'rejected',
        note: 'odd blank',
        reasonCode: 'bad_format',
      },
    })
    expect(mockedFinish).toHaveBeenCalledWith({
      data: {
        sessionId: 's1',
        feedbackText: '',
        decisions: [{ bitId: 'bit-1', verdict: 'rejected', note: 'odd blank', reasonCode: 'bad_format' }],
      },
    })
  })

  it('should keep the session open once when edited notes cannot be saved, then finish on the second try', async () => {
    mockedPut.mockResolvedValue({ ok: false, error: 'boom', status: 500 })
    mockedFinish.mockResolvedValue({ ok: true, data: session({ status: 'distilled' }) })
    render(<Harness />)
    await startSession()
    fireEvent.click(screen.getByText('decide-approve'))
    fireEvent.click(screen.getByRole('button', { name: 'Finish triage' }))
    fireEvent.change(screen.getByTestId('triage-decision-note-bit-1'), { target: { value: 'ok' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))

    await screen.findByTestId('triage-feedback-error')
    expect(mockedFinish).not.toHaveBeenCalled()

    fireEvent.click(screen.getByRole('button', { name: 'Save' }))

    await screen.findByTestId('triage-result')
    expect(mockedFinish).toHaveBeenCalledTimes(1)
  })

  it('should clear a reason when the chosen chip is pressed again', async () => {
    render(<Harness />)
    await startSession()
    fireEvent.click(screen.getByText('decide-reject'))
    fireEvent.click(screen.getByRole('button', { name: 'Finish triage' }))

    const chip = screen.getByTestId('triage-decision-reason-bit-1-bad_format')

    fireEvent.click(chip)
    expect(chip.getAttribute('aria-pressed')).toBe('true')
    fireEvent.click(chip)
    expect(chip.getAttribute('aria-pressed')).toBe('false')
  })

  it('should lock the card list and ignore edits while the session is being finished', async () => {
    const pending = deferred<TriageOutcome<ReturnType<typeof session>>>()

    mockedFinish.mockReturnValue(pending.promise)
    render(<Harness />)
    await startSession()
    fireEvent.click(screen.getByText('decide-reject'))
    fireEvent.click(screen.getByRole('button', { name: 'Finish triage' }))
    fireEvent.change(screen.getByTestId('triage-decision-note-bit-1'), { target: { value: 'before' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))

    await waitFor(() => expect(mockedFinish).toHaveBeenCalledTimes(1))
    expect((screen.getByTestId('triage-decision-note-bit-1') as HTMLTextAreaElement).disabled).toBe(true)
    expect(
      (screen.getByTestId('triage-decision-reason-bit-1-bad_format') as HTMLButtonElement).disabled,
    ).toBe(true)

    fireEvent.change(screen.getByTestId('triage-decision-note-bit-1'), { target: { value: 'late' } })
    fireEvent.click(screen.getByTestId('triage-decision-reason-bit-1-bad_format'))
    await act(async () => {
      pending.resolve({ ok: true, data: session({ status: 'saved_text_only' }) })
    })

    await screen.findByTestId('triage-result')
    expect(mockedFinish).toHaveBeenCalledWith({
      data: expect.objectContaining({
        decisions: [{ bitId: 'bit-1', verdict: 'rejected', note: 'before' }],
      }),
    })
  })

  it('should ignore a slow decision list from a session that was discarded before the next one started', async () => {
    const slow = deferred<Awaited<ReturnType<typeof listTriageDecisions>>>()

    mockedList.mockReturnValueOnce(slow.promise)
    mockedStart.mockResolvedValueOnce({ ok: true, data: session({ id: 'A' }) })
    mockedStart.mockResolvedValueOnce({ ok: true, data: session({ id: 'B' }) })
    mockedFinish.mockResolvedValue({ ok: false, error: 'gone', status: 409 })
    render(<Harness />)
    await startSession()
    fireEvent.click(screen.getByText('decide-reject'))
    fireEvent.click(screen.getByRole('button', { name: 'Finish triage' }))
    fireEvent.click(screen.getByRole('button', { name: 'Skip' }))
    fireEvent.click(await screen.findByRole('button', { name: 'Discard this session' }))
    await startSession()
    fireEvent.click(screen.getByText('decide-reject'))
    fireEvent.click(screen.getByRole('button', { name: 'Finish triage' }))

    await act(async () => {
      slow.resolve({ ok: true, data: [decisionRow('bit-1', 'rejected')] })
    })

    expect(screen.queryByText('Front bit-1')).toBeNull()
    expect(window.localStorage.getItem('post-anki:open-triage-session')).toBe('B')
  })

  it.each([404, 409])(
    'should keep the session open once and then finish anyway when saving a card edit answers %i',
    async (status) => {
      mockedPut.mockResolvedValue({ ok: false, error: 'conflict', status })
      mockedFinish.mockResolvedValue({ ok: true, data: session({ status: 'distilled' }) })
      render(<Harness />)
      await startSession()
      fireEvent.click(screen.getByText('decide-reject'))
      fireEvent.click(screen.getByRole('button', { name: 'Finish triage' }))
      fireEvent.change(screen.getByTestId('triage-decision-note-bit-1'), { target: { value: 'x' } })
      fireEvent.click(screen.getByRole('button', { name: 'Save' }))

      await screen.findByTestId('triage-feedback-error')
      expect(mockedFinish).not.toHaveBeenCalled()
      fireEvent.click(screen.getByRole('button', { name: 'Save' }))

      await screen.findByTestId('triage-result')
      expect(mockedFinish).toHaveBeenCalledTimes(1)
    },
  )

  it('should retry changed cards on the next Save after a failed attempt', async () => {
    mockedPut.mockResolvedValueOnce({ ok: false, error: 'boom', status: 500 })
    mockedFinish.mockResolvedValue({ ok: true, data: session({ status: 'distilled' }) })
    render(<Harness />)
    await startSession()
    fireEvent.click(screen.getByText('decide-reject'))
    fireEvent.click(screen.getByRole('button', { name: 'Finish triage' }))
    fireEvent.change(screen.getByTestId('triage-decision-note-bit-1'), { target: { value: 'a' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))
    await screen.findByTestId('triage-feedback-error')

    fireEvent.change(screen.getByTestId('triage-decision-note-bit-1'), { target: { value: 'ab' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))

    await screen.findByTestId('triage-result')
    expect(mockedPut).toHaveBeenCalledTimes(2)
    expect(mockedPut).toHaveBeenLastCalledWith({
      data: expect.objectContaining({ bitId: 'bit-1', note: 'ab' }),
    })
  })
})
