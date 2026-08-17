// @vitest-environment jsdom
import type { ReactNode } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'

import type { LearningListRecommendation } from '@post-anki/shared'

vi.mock('@tanstack/react-router', () => ({
  Link: ({ children, params }: { children: ReactNode; params?: Record<string, string> }) => (
    <a href={`/subject/${params?.subjectId}/map`}>{children}</a>
  ),
}))

import { RecommendationReview } from './recommendation-review'

afterEach(cleanup)

const recommendation: LearningListRecommendation = {
  verdict: 'series',
  reasons: [
    'the page states it is part of a series: "Part 1 of the agentic AI security guide"',
    '8 sibling article links were found in the page navigation',
  ],
  destination: 'mini_course',
  areaId: 'area-ai-ml',
  areaName: 'AI/ML Services',
  subSubjectNodeId: 'node-aws',
  subjectId: 'subject-1',
  concern: 'security',
  partCount: 9,
  existingCurriculumMatch: null,
}

function renderReview(
  onResolve = vi.fn().mockResolvedValue({ ok: true, data: {} }),
) {
  const onResolved = vi.fn()

  render(
    <RecommendationReview
      itemId="item-1"
      title="Security for agentic AI on AWS"
      recommendation={recommendation}
      onResolve={onResolve}
      onResolved={onResolved}
    />,
  )

  return { onResolve, onResolved }
}

describe('RecommendationReview', () => {
  it('should show every signal that produced the verdict', () => {
    renderReview()

    const signals = screen.getByTestId('recommendation-signals')

    expect(signals.textContent).toContain('part of a series')
    expect(signals.textContent).toContain('8 sibling article links')
  })

  it('should tell the user how to override a wrong series call', () => {
    renderReview()

    expect(screen.getByTestId('recommendation-review').textContent).toContain(
      'decline',
    )
  })

  it('should show the placement it would use', () => {
    renderReview()

    const review = screen.getByTestId('recommendation-review')

    expect(review.textContent).toContain('AI/ML Services')
    expect(review.textContent).toContain('security')
    expect(review.textContent).toContain('9 parts detected')
  })

  it('should approve through the recommendation endpoint', async () => {
    const { onResolve, onResolved } = renderReview()

    fireEvent.click(screen.getByTestId('recommendation-approve'))

    await waitFor(() => expect(onResolved).toHaveBeenCalled())
    expect(onResolve).toHaveBeenCalledWith({
      itemId: 'item-1',
      decision: 'approve',
    })
  })

  it('should make clear that declining created nothing', async () => {
    renderReview()

    fireEvent.click(screen.getByTestId('recommendation-decline'))

    const outcome = await screen.findByTestId('recommendation-outcome')

    expect(outcome.textContent).toContain(
      'No course, module, topic or question was created',
    )
    expect(screen.queryByTestId('recommendation-approve')).toBeNull()
  })

  it('should offer to fold into the Area, not create a mini-course', async () => {
    const foldInRec: LearningListRecommendation = {
      ...recommendation,
      destination: 'fold_in',
      areaId: 'area-effects',
      areaName: 'Effects & Synchronization',
      subjectId: 'subject-1',
    }

    render(
      <RecommendationReview
        itemId="item-3"
        title="A single article"
        recommendation={foldInRec}
        onResolve={vi.fn().mockResolvedValue({ ok: true, data: {} })}
        onResolved={vi.fn()}
      />,
    )

    expect(screen.getByTestId('recommendation-approve').textContent).toContain(
      'fold into the Area',
    )

    fireEvent.click(screen.getByTestId('recommendation-approve'))

    const outcome = await screen.findByTestId('recommendation-outcome')

    expect(outcome.textContent).toContain('Folded into your Area')
    expect(outcome.textContent).toContain('Effects & Synchronization')
    expect(outcome.querySelector('a')?.getAttribute('href')).toBe(
      '/subject/subject-1/map',
    )
  })

  it('should never render an empty signal list', () => {
    render(
      <RecommendationReview
        itemId="item-2"
        title="An unlabelled guide"
        recommendation={{ ...recommendation, reasons: [] }}
        onResolve={vi.fn()}
        onResolved={vi.fn()}
      />,
    )

    const signals = screen.getAllByTestId('recommendation-signals').at(-1)

    expect(signals?.textContent).toContain('guess')
  })
})
