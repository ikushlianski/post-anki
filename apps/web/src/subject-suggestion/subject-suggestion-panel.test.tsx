// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import type { SubjectSuggestion } from '@post-anki/shared'

import type { Subject } from '../curriculum/model'

vi.mock('./subject-suggestion.api', () => ({
  runSubjectSuggestionScan: vi.fn(),
  listPendingSubjectSuggestions: vi.fn(),
  resolveSubjectSuggestion: vi.fn(),
}))

import * as api from './subject-suggestion.api'
import { SubjectSuggestionPanel } from './subject-suggestion-panel'

const SUGGESTION: SubjectSuggestion = {
  id: 's1',
  kind: 'sub-subject',
  parentSubjectId: 'p1',
  proposedName: 'Cold outreach',
  reason: 'Many saved items cover cold outreach.',
  evidenceCount: 12,
  evidenceSamples: ['first sample', 'second sample'],
  status: 'pending',
  createdSubjectId: null,
  createdAt: '2026-10-24T00:00:00.000Z',
  resolvedAt: null,
}

const SUBJECTS = [{ id: 'p1', name: 'Sales' }] as unknown as Subject[]

beforeEach(() => {
  vi.resetAllMocks()
})

afterEach(cleanup)

function renderPanel(initial: SubjectSuggestion[] = [SUGGESTION]) {
  return render(<SubjectSuggestionPanel initialSuggestions={initial} allSubjects={SUBJECTS} />)
}

describe('SubjectSuggestionPanel', () => {
  it('should show the parent subject, reason, evidence count and samples for a suggestion', () => {
    renderPanel()

    const row = screen.getByTestId('subject-suggestion-s1').textContent ?? ''

    expect(row).toContain('inside Sales')
    expect(row).toContain('Cold outreach')
    expect(row).toContain('12 saved items')
    expect(row).toContain('second sample')
  })

  it('should show an empty state when nothing is suggested', () => {
    renderPanel([])

    expect(screen.getByTestId('subject-suggestion-empty')).toBeTruthy()
  })

  it('should approve with the edited name and remove the row', async () => {
    vi.mocked(api.resolveSubjectSuggestion).mockResolvedValue({
      outcome: 'resolved',
      suggestion: { ...SUGGESTION, status: 'approved' },
    })
    renderPanel()

    fireEvent.click(screen.getByTestId('subject-suggestion-edit-s1'))
    fireEvent.change(screen.getByTestId('subject-suggestion-name-input-s1'), {
      target: { value: '  Outbound  ' },
    })
    fireEvent.click(screen.getByTestId('subject-suggestion-approve-s1'))

    await waitFor(() => expect(screen.queryByTestId('subject-suggestion-s1')).toBeNull())
    expect(api.resolveSubjectSuggestion).toHaveBeenCalledWith({
      data: { suggestionId: 's1', input: { action: 'approve', name: 'Outbound' } },
    })
  })

  it('should approve without a name override when the name was not changed', async () => {
    vi.mocked(api.resolveSubjectSuggestion).mockResolvedValue({
      outcome: 'resolved',
      suggestion: { ...SUGGESTION, status: 'approved' },
    })
    renderPanel()

    fireEvent.click(screen.getByTestId('subject-suggestion-approve-s1'))

    await waitFor(() => expect(api.resolveSubjectSuggestion).toHaveBeenCalled())
    expect(api.resolveSubjectSuggestion).toHaveBeenCalledWith({
      data: { suggestionId: 's1', input: { action: 'approve' } },
    })
  })

  it('should dismiss a suggestion and remove the row', async () => {
    vi.mocked(api.resolveSubjectSuggestion).mockResolvedValue({
      outcome: 'resolved',
      suggestion: { ...SUGGESTION, status: 'dismissed' },
    })
    renderPanel()

    fireEvent.click(screen.getByTestId('subject-suggestion-dismiss-s1'))

    await waitFor(() => expect(screen.queryByTestId('subject-suggestion-s1')).toBeNull())
    expect(api.resolveSubjectSuggestion).toHaveBeenCalledWith({
      data: { suggestionId: 's1', input: { action: 'dismiss' } },
    })
  })

  it('should keep the row and explain inline when the name is already taken', async () => {
    vi.mocked(api.resolveSubjectSuggestion).mockResolvedValue({ outcome: 'name_taken' })
    renderPanel()

    fireEvent.click(screen.getByTestId('subject-suggestion-approve-s1'))

    expect((await screen.findByTestId('subject-suggestion-error-s1')).textContent).toContain(
      'already exists',
    )
    expect(screen.getByTestId('subject-suggestion-s1')).toBeTruthy()
    expect(screen.getByTestId('subject-suggestion-name-input-s1')).toBeTruthy()
  })

  it('should report counts after a scan and refresh the list', async () => {
    vi.mocked(api.runSubjectSuggestionScan).mockResolvedValue({
      created: 2,
      skipped: 1,
      calls: 3,
      budgetStopped: false,
    })
    vi.mocked(api.listPendingSubjectSuggestions).mockResolvedValue([
      { ...SUGGESTION, id: 's2', proposedName: 'Negotiation' },
    ])
    renderPanel([])

    fireEvent.click(screen.getByTestId('subject-suggestion-scan-button'))

    expect((await screen.findByTestId('subject-suggestion-scan-message')).textContent).toContain(
      '2 new suggestions',
    )
    expect(await screen.findByTestId('subject-suggestion-s2')).toBeTruthy()
  })

  it('should tell the user when the scan stopped because the budget was reached', async () => {
    vi.mocked(api.runSubjectSuggestionScan).mockResolvedValue({
      created: 0,
      skipped: 0,
      calls: 1,
      budgetStopped: true,
    })
    vi.mocked(api.listPendingSubjectSuggestions).mockResolvedValue([])
    renderPanel([])

    fireEvent.click(screen.getByTestId('subject-suggestion-scan-button'))

    expect((await screen.findByTestId('subject-suggestion-scan-message')).textContent).toContain(
      'Budget reached',
    )
  })

  it('should show an error instead of a false result when the scan fails', async () => {
    vi.mocked(api.runSubjectSuggestionScan).mockRejectedValue(new Error('boom'))
    renderPanel([])

    fireEvent.click(screen.getByTestId('subject-suggestion-scan-button'))

    expect(await screen.findByTestId('subject-suggestion-scan-error')).toBeTruthy()
  })
})
