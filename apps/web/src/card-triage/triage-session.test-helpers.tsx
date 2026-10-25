import { useState } from 'react'
import { fireEvent, screen } from '@testing-library/react'
import type { CardStyleNote, TriageDecisionResponse, TriageSessionResponse } from '@post-anki/shared'

import type { ReviewDecisions } from '../knowledge-bit/use-review-decisions'
import { TriageSessionSection } from './triage-session-section'
import { useTriageSession } from './use-triage-session'

export const NOTE: CardStyleNote = {
  id: 'n1',
  subjectId: null,
  sessionId: 's1',
  text: 'Prefer short answers',
  enabled: true,
  createdAt: '2026-10-24T10:00:00.000Z',
}

export function session(overrides: Partial<TriageSessionResponse> = {}): TriageSessionResponse {
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

export function decisionRow(bitId: string, verdict: 'approved' | 'rejected'): TriageDecisionResponse {
  return {
    id: `ctd_${bitId}`,
    sessionId: 's1',
    bitId,
    verdict,
    reasonCode: null,
    note: null,
    decidedAt: '2026-10-24T10:01:00.000Z',
    orderIndex: 0,
    dwellMs: null,
    front: `Front ${bitId}`,
    back: `Back ${bitId}`,
    variants: [],
    undoneAt: null,
    source: 'client',
  }
}

export function Harness({
  initial = {},
  undecidedCount,
}: {
  initial?: ReviewDecisions
  undecidedCount?: number
}) {
  const [decisions, setDecisions] = useState<ReviewDecisions>(initial)
  const triage = useTriageSession({ decisions, undecidedCount })

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

export async function startSession() {
  fireEvent.click(screen.getByRole('button', { name: 'Start triage' }))
  await screen.findByRole('button', { name: 'Finish triage' })
}

export function deferred<T>() {
  let resolve: (value: T) => void = () => undefined
  const promise = new Promise<T>((done) => {
    resolve = done
  })

  return { promise, resolve }
}
