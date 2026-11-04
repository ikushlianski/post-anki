// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
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
  { bitId: 'b1', verdict: 'rejected', reasonCode: 'text_recall_only', note: 'odd blank' },
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

  it('should show the card context on the line above the question when the stored front has one', () => {
    const card = { ...CARD, front: 'reading a cache config\nWhat is TTL?' }

    render(<TriageDecisionsList decisions={DECISIONS} cards={{ b1: card }} onEdit={vi.fn()} />)

    const front = screen.getByText('reading a cache config What is TTL?')

    expect(front.textContent).toBe('reading a cache config\nWhat is TTL?')
    expect(front.className).toContain('whitespace-pre-line')
  })

  it('should offer the reject reasons of the card subject type', () => {
    render(
      <TriageDecisionsList decisions={DECISIONS} cards={{ b1: { ...CARD, subjectType: 'language' } }} onEdit={vi.fn()} />,
    )

    expect(screen.getByTestId('triage-decision-reason-b1-front_unclear_target_phrase')).toBeTruthy()
    expect(screen.queryByTestId('triage-decision-reason-b1-no_code_context')).toBeNull()
  })

  it('should fall back to the general reject reasons when the subject type is missing', () => {
    render(<TriageDecisionsList decisions={DECISIONS} cards={{ b1: CARD }} onEdit={vi.fn()} />)

    expect(screen.getByTestId('triage-decision-reason-b1-text_recall_only')).toBeTruthy()
    expect(screen.queryByTestId('triage-decision-reason-b1-front_unclear_target_phrase')).toBeNull()
  })

  it('should still list a card whose text the server could not return', () => {
    render(<TriageDecisionsList decisions={DECISIONS} cards={{}} onEdit={vi.fn()} />)

    expect(screen.getAllByText('Card text unavailable')).toHaveLength(2)
  })

  it('should offer the selectable reject reasons only on rejected cards and mark the chosen one', () => {
    render(<TriageDecisionsList decisions={DECISIONS} cards={{ b1: CARD }} onEdit={vi.fn()} />)

    expect(
      screen.getByTestId('triage-decision-reason-b1-text_recall_only').getAttribute('aria-pressed'),
    ).toBe('true')
    expect(
      screen.getByTestId('triage-decision-reason-b1-wrong_language').getAttribute('aria-pressed'),
    ).toBe('false')
    expect(screen.queryByTestId('triage-decision-reason-b2-text_recall_only')).toBeNull()
  })

  it('should not offer legacy reasons in the picker', () => {
    render(<TriageDecisionsList decisions={DECISIONS} cards={{ b1: CARD }} onEdit={vi.fn()} />)

    expect(screen.getByTestId('triage-decision-reason-b1-question_bent_to_answer')).toBeTruthy()
    expect(screen.queryByTestId('triage-decision-reason-b1-bad_format')).toBeNull()
    expect(screen.queryByTestId('triage-decision-reason-b1-meta_wording')).toBeNull()
  })

  it('should report note edits and reason changes for the card they belong to', () => {
    const onEdit = vi.fn()

    render(<TriageDecisionsList decisions={DECISIONS} cards={{ b1: CARD }} onEdit={onEdit} />)

    fireEvent.change(screen.getByTestId('triage-decision-note-b2'), { target: { value: 'good' } })
    fireEvent.click(screen.getByTestId('triage-decision-reason-b1-wrong_language'))
    fireEvent.click(screen.getByTestId('triage-decision-reason-b1-text_recall_only'))

    expect(onEdit).toHaveBeenNthCalledWith(1, 'b2', { note: 'good' })
    expect(onEdit).toHaveBeenNthCalledWith(2, 'b1', { reasonCode: 'wrong_language' })
    expect(onEdit).toHaveBeenNthCalledWith(3, 'b1', { reasonCode: null })
  })

  it('should render nothing when the session has no decisions', () => {
    render(<TriageDecisionsList decisions={[]} cards={{}} onEdit={vi.fn()} />)

    expect(screen.queryByTestId('triage-decisions-list')).toBeNull()
  })

  it('should offer Send to Chat only on rejected cards', () => {
    render(
      <TriageDecisionsList
        decisions={DECISIONS}
        cards={{ b1: CARD }}
        onEdit={vi.fn()}
        onSendToChat={vi.fn()}
      />,
    )

    expect(screen.getByTestId('triage-decision-send-chat-b1')).toBeTruthy()
    expect(screen.queryByTestId('triage-decision-send-chat-b2')).toBeNull()
  })

  it('should show a card as sent to Chat once the move succeeds', async () => {
    const onSendToChat = vi.fn().mockResolvedValue(true)

    render(
      <TriageDecisionsList
        decisions={DECISIONS}
        cards={{ b1: CARD }}
        onEdit={vi.fn()}
        onSendToChat={onSendToChat}
      />,
    )
    fireEvent.click(screen.getByTestId('triage-decision-send-chat-b1'))

    await waitFor(() => expect(screen.getByTestId('triage-decision-in-chat-b1')).toBeTruthy())
    expect(onSendToChat).toHaveBeenCalledWith('b1')
    expect(screen.queryByTestId('triage-decision-send-chat-b1')).toBeNull()
  })

  it('should keep the card and show an error when the move to Chat fails', async () => {
    render(
      <TriageDecisionsList
        decisions={DECISIONS}
        cards={{ b1: CARD }}
        onEdit={vi.fn()}
        onSendToChat={vi.fn().mockResolvedValue(false)}
      />,
    )
    fireEvent.click(screen.getByTestId('triage-decision-send-chat-b1'))

    await waitFor(() => expect(screen.getByTestId('triage-decision-chat-error-b1')).toBeTruthy())
    expect(screen.getByTestId('triage-decision-b1')).toBeTruthy()
    expect(screen.getByTestId('triage-decision-send-chat-b1')).toBeTruthy()
  })
})
