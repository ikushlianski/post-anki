// @vitest-environment jsdom
import { useState, type ReactNode } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import type { CardStyleNote, TriageSessionResponse } from '@post-anki/shared'

import type { ReviewDecisions } from '../knowledge-bit/use-review-decisions'
import { finishTriageSession, startTriageSession } from './card-triage.api'
import { TriageSessionSection } from './triage-session-section'
import { useTriageSession } from './use-triage-session'

vi.mock('@tanstack/react-router', () => ({
  Link: ({ to, children, ...rest }: { to: string; children: ReactNode } & Record<string, unknown>) => (
    <a href={to} {...rest}>
      {children}
    </a>
  ),
}))

vi.mock('./card-triage.api', () => ({
  startTriageSession: vi.fn(),
  finishTriageSession: vi.fn(),
}))

const mockedStart = vi.mocked(startTriageSession)
const mockedFinish = vi.mocked(finishTriageSession)

const NOTE: CardStyleNote = {
  id: 'n1',
  subjectId: null,
  sessionId: 's1',
  text: 'Prefer short answers',
  enabled: true,
  createdAt: '2026-10-24T10:00:00.000Z',
}

function session(overrides: Partial<TriageSessionResponse> = {}): TriageSessionResponse {
  return {
    id: 's1',
    subjectId: null,
    status: 'open',
    startedAt: '2026-10-24T10:00:00.000Z',
    endedAt: null,
    acceptedCount: 0,
    rejectedCount: 0,
    feedbackText: null,
    notes: [],
    ...overrides,
  }
}

function Harness({ initial = {} }: { initial?: ReviewDecisions }) {
  const [decisions, setDecisions] = useState<ReviewDecisions>(initial)
  const triage = useTriageSession({ decisions })

  return (
    <div>
      <button
        type="button"
        onClick={() =>
          setDecisions((prev) => ({
            ...prev,
            [`bit-${Object.keys(prev).length + 1}`]: { verdict: 'approved', feedbackId: null },
          }))
        }
      >
        decide-approve
      </button>
      <button
        type="button"
        onClick={() =>
          setDecisions((prev) => ({
            ...prev,
            [`bit-${Object.keys(prev).length + 1}`]: { verdict: 'rejected', feedbackId: 'f' },
          }))
        }
      >
        decide-reject
      </button>
      <input aria-label="other-field" />
      <TriageSessionSection session={triage} />
    </div>
  )
}

async function startSession() {
  fireEvent.click(screen.getByRole('button', { name: 'Start triage' }))
  await screen.findByRole('button', { name: 'Finish triage' })
}

describe('TriageSessionSection', () => {
  beforeEach(() => {
    window.localStorage.clear()
    mockedStart.mockReset()
    mockedFinish.mockReset()
    mockedStart.mockResolvedValue({ ok: true, data: session() })
  })

  afterEach(() => {
    cleanup()
  })

  it('should show accepted and rejected counts only for cards decided after the session started', async () => {
    render(<Harness initial={{ old: { verdict: 'approved', feedbackId: null } }} />)

    await startSession()
    fireEvent.click(screen.getByText('decide-approve'))
    fireEvent.click(screen.getByText('decide-approve'))
    fireEvent.click(screen.getByText('decide-reject'))

    expect(screen.getByTestId('triage-counts').textContent).toBe(
      'Triage: 3 decided (2 accepted, 1 rejected)',
    )
  })

  it('should start a session with the s key and ignore s and f while typing in a field', async () => {
    render(<Harness />)

    const field = screen.getByLabelText('other-field')

    fireEvent.keyDown(field, { key: 's' })
    expect(mockedStart).not.toHaveBeenCalled()

    fireEvent.keyDown(window, { key: 's' })
    await screen.findByRole('button', { name: 'Finish triage' })

    fireEvent.keyDown(field, { key: 'f' })
    expect(screen.queryByTestId('triage-feedback-panel')).toBeNull()

    fireEvent.keyDown(window, { key: 'f' })
    expect(screen.getByTestId('triage-feedback-panel')).toBeTruthy()
  })

  it('should not treat s or f typed inside the feedback box as shortcuts', async () => {
    render(<Harness />)
    await startSession()
    fireEvent.click(screen.getByRole('button', { name: 'Finish triage' }))

    const box = screen.getByTestId('triage-feedback-text')

    fireEvent.keyDown(box, { key: 'f' })
    fireEvent.keyDown(box, { key: 's' })

    expect(mockedStart).toHaveBeenCalledTimes(1)
    expect(screen.getByTestId('triage-feedback-panel')).toBeTruthy()
  })

  it('should tell the user how many cards the session covers and send the decisions on Save', async () => {
    mockedFinish.mockResolvedValue({
      ok: true,
      data: session({ status: 'distilled', acceptedCount: 1, rejectedCount: 1, notes: [NOTE] }),
    })
    render(<Harness />)
    await startSession()
    fireEvent.click(screen.getByText('decide-approve'))
    fireEvent.click(screen.getByText('decide-reject'))
    fireEvent.click(screen.getByRole('button', { name: 'Finish triage' }))

    expect(screen.getByTestId('triage-feedback-count').textContent).toContain('covers 2 cards')

    fireEvent.change(screen.getByTestId('triage-feedback-text'), { target: { value: 'too long' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))

    await screen.findByTestId('triage-result')
    expect(mockedFinish).toHaveBeenCalledWith({
      data: {
        sessionId: 's1',
        feedbackText: 'too long',
        decisions: [
          { bitId: 'bit-1', verdict: 'approved' },
          { bitId: 'bit-2', verdict: 'rejected' },
        ],
      },
    })
    expect(screen.getByText('Prefer short answers')).toBeTruthy()
    expect(window.localStorage.length).toBe(0)
  })

  it('should keep the typed feedback and the open session when saving fails', async () => {
    mockedFinish.mockResolvedValue({ ok: false, error: 'boom' })
    render(<Harness />)
    await startSession()
    fireEvent.click(screen.getByRole('button', { name: 'Finish triage' }))
    fireEvent.change(screen.getByTestId('triage-feedback-text'), { target: { value: 'dictated text' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))

    await screen.findByTestId('triage-feedback-error')
    expect((screen.getByTestId('triage-feedback-text') as HTMLTextAreaElement).value).toBe(
      'dictated text',
    )
    expect(window.localStorage.getItem('post-anki:open-triage-session')).toBe('s1')
  })

  it('should close the session without feedback text when the user skips', async () => {
    mockedFinish.mockResolvedValue({ ok: true, data: session({ status: 'distilled' }) })
    render(<Harness />)
    await startSession()
    fireEvent.click(screen.getByRole('button', { name: 'Finish triage' }))
    fireEvent.click(screen.getByRole('button', { name: 'Skip' }))

    await waitFor(() => expect(screen.getByRole('button', { name: 'Start triage' })).toBeTruthy())
    expect(mockedFinish).toHaveBeenCalledWith({
      data: { sessionId: 's1', feedbackText: '', decisions: [] },
    })
  })

  it('should offer to finish a session left open before a reload', async () => {
    window.localStorage.setItem('post-anki:open-triage-session', 's9')
    render(<Harness />)

    await screen.findByTestId('triage-resumed')
    expect(screen.getByRole('button', { name: 'Finish triage' })).toBeTruthy()
    expect(mockedStart).not.toHaveBeenCalled()
  })

  it('should still start a session when browser storage is unavailable', async () => {
    const setItem = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('denied')
    })

    render(<Harness />)
    await startSession()

    expect(screen.getByTestId('triage-counts')).toBeTruthy()
    setItem.mockRestore()
  })
})
