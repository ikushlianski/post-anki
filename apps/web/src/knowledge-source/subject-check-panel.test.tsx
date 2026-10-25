// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'

import type { SubjectCheckNewSubject, SubjectCheckRecommendation } from '@post-anki/shared'

import { SubjectCheckPanel } from './subject-check-panel'
import type { SubjectCheckState } from './use-subject-check'

function rec(subjectId: string, confidence: SubjectCheckRecommendation['confidence']): SubjectCheckRecommendation {
  return { subjectId, subjectLabel: `Label ${subjectId}`, confidence, reason: `Reason ${subjectId}` }
}

function advice(recommendations: SubjectCheckRecommendation[], newSubject: SubjectCheckNewSubject | null = null): SubjectCheckState {
  return { status: 'advice', response: { status: 'ok', recommendations, newSubject } }
}

function renderPanel(state: SubjectCheckState) {
  const handlers = {
    onUse: vi.fn(),
    onCreate: vi.fn(),
    onPickAnother: vi.fn(),
    onAddWithoutSubject: vi.fn(),
  }

  render(<SubjectCheckPanel state={state} busy={false} {...handlers} />)

  return handlers
}

const proposal: SubjectCheckNewSubject = {
  name: 'Rust',
  parentSubjectId: 'sub_root',
  parentLabel: 'Languages',
  kind: 'language',
  reason: 'Nothing else covers it',
}

describe('SubjectCheckPanel', () => {
  afterEach(cleanup)

  it('shows nothing but an empty polite live region when there is no advice', () => {
    renderPanel({ status: 'idle' })

    expect(screen.getByTestId('subject-check-region').getAttribute('aria-live')).toBe('polite')
    expect(screen.queryByTestId('subject-check-panel')).toBeNull()
  })

  it('announces that the subject is being checked', () => {
    renderPanel({ status: 'checking' })

    expect(screen.getByTestId('subject-check-checking').textContent).toBe('Checking subject…')
  })

  it('lists each suggestion with its reason and strength in plain words', () => {
    renderPanel(advice([rec('a', 'high'), rec('b', 'medium'), rec('c', 'low')]))

    expect(screen.getByTestId('subject-check-row-a').textContent).toContain('Strong match')
    expect(screen.getByTestId('subject-check-row-b').textContent).toContain('Likely match')
    expect(screen.getByTestId('subject-check-row-c').textContent).toContain('Possible match')
    expect(screen.getByTestId('subject-check-row-a').textContent).toContain('Reason a')
  })

  it('highlights only a high-confidence row as the primary choice', () => {
    renderPanel(advice([rec('a', 'high'), rec('b', 'medium'), rec('c', 'low')]))

    expect(screen.getByTestId('subject-check-use-a').getAttribute('data-emphasis')).toBe('primary')
    expect(screen.getByTestId('subject-check-use-b').getAttribute('data-emphasis')).toBe('secondary')
    expect(screen.getByTestId('subject-check-use-c').getAttribute('data-emphasis')).toBe('secondary')
  })

  it('highlights no row when nothing is a strong match', () => {
    renderPanel(advice([rec('b', 'medium'), rec('c', 'low')]))

    expect(document.querySelectorAll('[data-emphasis="primary"]').length).toBe(0)
  })

  it('files under the tapped subject only when the owner taps its button', () => {
    const { onUse } = renderPanel(advice([rec('a', 'medium'), rec('b', 'low')]))

    expect(onUse).not.toHaveBeenCalled()
    fireEvent.click(screen.getByTestId('subject-check-use-b'))

    expect(onUse).toHaveBeenCalledWith('b')
  })

  it('offers picking another subject and adding without one', () => {
    const { onPickAnother, onAddWithoutSubject } = renderPanel(advice([rec('a', 'low')]))

    fireEvent.click(screen.getByTestId('subject-check-pick-another'))
    fireEvent.click(screen.getByTestId('subject-check-add-without'))

    expect(onPickAnother).toHaveBeenCalledTimes(1)
    expect(onAddWithoutSubject).toHaveBeenCalledTimes(1)
  })

  it('renders model text as plain text, never as markup', () => {
    renderPanel(advice([{ ...rec('a', 'low'), reason: '<img src=x onerror=alert(1)> **bold**' }]))

    expect(document.querySelector('img')).toBeNull()
    expect(screen.getByTestId('subject-check-row-a').textContent).toContain('<img src=x onerror=alert(1)> **bold**')
  })

  it('proposes a new subject with its placement and kind and creates it on tap', () => {
    const { onCreate } = renderPanel(advice([], proposal))

    expect(screen.getByTestId('subject-check-new-subject').textContent).toContain('under Languages')
    expect(screen.getByTestId('subject-check-new-subject').textContent).toContain('language subject')

    fireEvent.click(screen.getByTestId('subject-check-create'))

    expect(onCreate).toHaveBeenCalledWith(proposal)
  })

  it('removes the proposal when declined and keeps the other choices', () => {
    renderPanel(advice([rec('a', 'low')], proposal))

    fireEvent.click(screen.getByTestId('subject-check-decline-new'))

    expect(screen.queryByTestId('subject-check-new-subject')).toBeNull()
    expect(screen.getByTestId('subject-check-pick-another')).toBeTruthy()
    expect(screen.getByTestId('subject-check-add-without')).toBeTruthy()
  })
})
