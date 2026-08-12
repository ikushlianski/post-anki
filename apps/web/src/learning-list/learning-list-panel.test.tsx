// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'

import { LearningListPanel } from './learning-list-panel'
import type { LearningListItemWithLiveness } from './learning-list.model'

afterEach(cleanup)

function item(
  overrides: Partial<LearningListItemWithLiveness>,
): LearningListItemWithLiveness {
  return {
    id: 'item-1',
    url: 'https://example.com/a',
    rawText: null,
    title: 'An article',
    kind: 'article',
    verdict: 'single',
    recommendation: null,
    status: 'folded_in',
    curriculumId: null,
    questionsGenerated: 0,
    questionCeiling: null,
    createdAt: '2026-08-01T00:00:00.000Z',
    updatedAt: '2026-08-01T00:00:00.000Z',
    liveness: null,
    ...overrides,
  }
}

function renderPanel(items: LearningListItemWithLiveness[]) {
  render(
    <LearningListPanel
      items={items}
      subjects={[{ id: 'subject-1', name: 'Web Development' }]}
      onResolve={vi.fn().mockResolvedValue({ ok: true, data: {} })}
      onResolved={vi.fn()}
      onChooseDestination={vi.fn().mockResolvedValue({ ok: true, data: {} })}
      onChosen={vi.fn()}
      onClassify={vi.fn().mockResolvedValue({ ok: true, data: {} })}
      onClassified={vi.fn()}
    />,
  )
}

describe('LearningListPanel', () => {
  it('should invite a first capture when nothing is listed', () => {
    renderPanel([])

    expect(screen.getByTestId('learning-list-empty')).toBeTruthy()
  })

  it('should keep a dormant item listed alongside a live one', () => {
    renderPanel([
      item({
        id: 'live-1',
        title: 'Live series',
        liveness: {
          entityType: 'learning_list_item',
          entityId: 'live-1',
          score: 8,
          dormant: false,
          generationAllowed: true,
          nudgeDue: false,
        },
      }),
      item({
        id: 'dormant-1',
        title: 'Set-aside series',
        liveness: {
          entityType: 'learning_list_item',
          entityId: 'dormant-1',
          score: 1,
          dormant: true,
          generationAllowed: false,
          nudgeDue: false,
        },
      }),
    ])

    const rows = screen.getAllByTestId('learning-list-item')

    expect(rows).toHaveLength(2)
    expect(screen.getByText('Set-aside series')).toBeTruthy()
  })

  it('should render a dormant item visibly distinct from a live one', () => {
    renderPanel([
      item({
        id: 'live-1',
        liveness: {
          entityType: 'learning_list_item',
          entityId: 'live-1',
          score: 8,
          dormant: false,
          generationAllowed: true,
          nudgeDue: false,
        },
      }),
      item({
        id: 'dormant-1',
        liveness: {
          entityType: 'learning_list_item',
          entityId: 'dormant-1',
          score: 1,
          dormant: true,
          generationAllowed: false,
          nudgeDue: false,
        },
      }),
    ])

    const [live, dormant] = screen.getAllByTestId('learning-list-item')

    expect(live.dataset.dormant).toBe('false')
    expect(dormant.dataset.dormant).toBe('true')
    expect(live.className).not.toBe(dormant.className)
  })

  it('should say a dormant item was not deleted', () => {
    renderPanel([
      item({
        id: 'dormant-1',
        liveness: {
          entityType: 'learning_list_item',
          entityId: 'dormant-1',
          score: 1,
          dormant: true,
          generationAllowed: false,
          nudgeDue: false,
        },
      }),
    ])

    expect(screen.getByTestId('learning-list-item').textContent).toContain(
      'Nothing was deleted',
    )
  })

  it('should show the approve and decline buttons only for an item awaiting a decision', () => {
    renderPanel([
      item({
        id: 'awaiting-1',
        status: 'classified',
        verdict: 'series',
        recommendation: {
          verdict: 'series',
          reasons: ['the page is labelled part 1 of 9'],
          destination: 'mini_course',
          areaId: null,
          areaName: null,
          subSubjectNodeId: null,
          subjectId: 'subject-1',
          concern: null,
          partCount: 9,
          existingCurriculumMatch: null,
        },
      }),
      item({ id: 'settled-1', status: 'folded_in' }),
    ])

    expect(screen.getAllByTestId('recommendation-review')).toHaveLength(1)
    expect(screen.getAllByTestId('recommendation-approve')).toHaveLength(1)
  })

  it('should show the deciding signals for a folded-in single article too', () => {
    renderPanel([
      item({
        id: 'folded-1',
        status: 'folded_in',
        verdict: 'single',
        recommendation: {
          verdict: 'single',
          reasons: [
            'no series wording, sibling article links or pagination were found',
          ],
          destination: 'fold_in',
          areaId: 'area-effects',
          areaName: 'Effects & Synchronization',
          subSubjectNodeId: 'node-react',
          subjectId: 'subject-1',
          concern: null,
          partCount: 0,
          existingCurriculumMatch: null,
        },
      }),
    ])

    expect(screen.getByTestId('recommendation-signals').textContent).toContain(
      'no series wording',
    )
    expect(screen.getByTestId('recommendation-placement').textContent).toContain(
      'Effects & Synchronization',
    )
    expect(screen.queryByTestId('recommendation-approve')).toBeNull()
    expect(screen.queryByTestId('recommendation-decline')).toBeNull()
  })

  it('should show the deciding signals for a parked item that could not be decided', () => {
    renderPanel([
      item({
        id: 'parked-1',
        status: 'parked',
        verdict: 'unknown',
        recommendation: {
          verdict: 'unknown',
          reasons: [
            'the page has next/previous pagination links',
            'nothing on the page states it belongs to a series, so this could not be confirmed',
          ],
          destination: 'park',
          areaId: null,
          areaName: null,
          subSubjectNodeId: null,
          subjectId: 'subject-1',
          concern: null,
          partCount: 0,
          existingCurriculumMatch: null,
        },
      }),
    ])

    const signals = screen.getByTestId('recommendation-signals')

    expect(signals.textContent).toContain('pagination links')
    expect(screen.getByTestId('learning-list-item').textContent).toContain(
      'too weak',
    )
    expect(screen.getByTestId('destination-choice')).toBeTruthy()
  })

  it('should offer to classify a discovered sibling still sitting as a bare capture', () => {
    renderPanel([item({ id: 'sibling-1', status: 'captured', verdict: null })])

    expect(screen.getByTestId('classify-action')).toBeTruthy()
    expect(screen.queryByTestId('destination-choice')).toBeNull()
  })

  it('should show generation progress against the ceiling', () => {
    renderPanel([
      item({ id: 'i1', questionsGenerated: 6, questionCeiling: 24 }),
    ])

    expect(screen.getByTestId('learning-list-item').textContent).toContain(
      '6/24 questions',
    )
  })
})
