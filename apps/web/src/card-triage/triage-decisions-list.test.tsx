// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import type { TriageDecision, TriageDecisionResponse } from '@post-anki/shared'

import { TriageDecisionsList } from './triage-decisions-list'

const CARD: TriageDecisionResponse = {
  id: 'ctd_1',
  sessionId: 's1',
  bitId: 'b1',
  verdict: 'rejected',
  reasonCode: null,
  note: null,
  decidedAt: '2026-10-25T10:00:00.000Z',
  orderIndex: 0,
  dwellMs: 1200,
  front: 'What is TTL?',
  back: 'Time to live',
  variants: [],
  undoneAt: null,
  source: 'client',
}

const DECISIONS: TriageDecision[] = [
  { bitId: 'b1', verdict: 'rejected', reasonCode: 'bad_format', note: 'odd blank' },
  { bitId: 'b2', verdict: 'approved' },
]

describe('TriageDecisionsList', () => {
  afterEach(() => {
    cleanup()
  })

  it('should show rejected cards expanded and accepted cards collapsed', () => {
    render(<TriageDecisionsList decisions={DECISIONS} cards={{ b1: CARD }} onEdit={vi.fn()} />)

    expect(screen.getByTestId('triage-decisions-rejected').hasAttribute('open')).toBe(true)
    expect(screen.getByTestId('triage-decisions-accepted').hasAttribute('open')).toBe(false)
    expect(screen.getByText('What is TTL?')).toBeTruthy()
    expect(screen.getByText('Time to live')).toBeTruthy()
  })

  it('should still list a card whose text the server could not return', () => {
    render(<TriageDecisionsList decisions={DECISIONS} cards={{}} onEdit={vi.fn()} />)

    expect(screen.getAllByText('Card text unavailable')).toHaveLength(2)
  })

  it('should offer the existing reject reasons only on rejected cards and mark the chosen one', () => {
    render(<TriageDecisionsList decisions={DECISIONS} cards={{ b1: CARD }} onEdit={vi.fn()} />)

    expect(
      screen.getByTestId('triage-decision-reason-b1-bad_format').getAttribute('aria-pressed'),
    ).toBe('true')
    expect(
      screen.getByTestId('triage-decision-reason-b1-wrong_language').getAttribute('aria-pressed'),
    ).toBe('false')
    expect(screen.queryByTestId('triage-decision-reason-b2-bad_format')).toBeNull()
  })

  it('should report note edits and reason changes for the card they belong to', () => {
    const onEdit = vi.fn()

    render(<TriageDecisionsList decisions={DECISIONS} cards={{ b1: CARD }} onEdit={onEdit} />)

    fireEvent.change(screen.getByTestId('triage-decision-note-b2'), { target: { value: 'good' } })
    fireEvent.click(screen.getByTestId('triage-decision-reason-b1-wrong_language'))
    fireEvent.click(screen.getByTestId('triage-decision-reason-b1-bad_format'))

    expect(onEdit).toHaveBeenNthCalledWith(1, 'b2', { note: 'good' })
    expect(onEdit).toHaveBeenNthCalledWith(2, 'b1', { reasonCode: 'wrong_language' })
    expect(onEdit).toHaveBeenNthCalledWith(3, 'b1', { reasonCode: null })
  })

  it('should render nothing when the session has no decisions', () => {
    render(<TriageDecisionsList decisions={[]} cards={{}} onEdit={vi.fn()} />)

    expect(screen.queryByTestId('triage-decisions-list')).toBeNull()
  })
})
