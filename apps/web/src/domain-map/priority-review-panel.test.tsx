// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { cleanup, render, screen, waitFor } from '@testing-library/react'

import { PriorityReviewPanel } from './priority-review-panel'
import { triggerPriorityReview } from './domain-map.api'

vi.mock('./domain-map.api', () => ({
  triggerPriorityReview: vi.fn(),
  resolveSuggestionStatus: vi.fn(),
  runDocScan: vi.fn(),
  resolveDocScanTopicSuggestion: vi.fn(),
  resolveDocScanSupersessionSuggestion: vi.fn(),
}))

const mockedTriggerPriorityReview = vi.mocked(triggerPriorityReview)

function renderPanel() {
  return render(
    <PriorityReviewPanel
      subjectId="sub-1"
      nodeNamesById={{}}
      initialSuggestions={[]}
      initialDue={true}
      initialNewTopicSuggestions={[]}
      initialSupersessionSuggestions={[]}
    />,
  )
}

describe('PriorityReviewPanel — review due banner', () => {
  beforeEach(() => {
    mockedTriggerPriorityReview.mockReset()
  })

  afterEach(() => {
    cleanup()
  })

  it('keeps the banner up and shows the error when the review fails, matching the 502 path', async () => {
    mockedTriggerPriorityReview.mockRejectedValue(new Error('Bad Gateway'))

    renderPanel()

    expect(screen.getByTestId('priority-review-due-banner')).toBeDefined()

    screen.getByTestId('priority-review-trigger-button').click()

    await waitFor(() => {
      expect(screen.getByTestId('priority-review-trigger-error')).toBeDefined()
    })

    expect(screen.getByTestId('priority-review-due-banner')).toBeDefined()
  })

  it('keeps the banner up when a successful review produced no suggestions', async () => {
    mockedTriggerPriorityReview.mockResolvedValue([])

    renderPanel()

    screen.getByTestId('priority-review-trigger-button').click()

    await waitFor(() => {
      expect(screen.getByTestId('priority-review-trigger-button').textContent).toBe(
        'Trigger review',
      )
    })

    expect(screen.getByTestId('priority-review-due-banner')).toBeDefined()
  })

  it('clears the banner once a review returns at least one suggestion', async () => {
    mockedTriggerPriorityReview.mockResolvedValue([
      {
        id: 'dprs-1',
        subjectId: 'sub-1',
        domainNodeId: 'dnode-1',
        currentTargetDepth: null,
        suggestedTargetDepth: 'deep',
        reason: 'Core to the subject.',
        source: 'general-knowledge',
        status: 'pending',
        createdAt: '2026-08-01T00:00:00.000Z',
        resolvedAt: null,
      },
    ])

    renderPanel()

    screen.getByTestId('priority-review-trigger-button').click()

    await waitFor(() => {
      expect(screen.queryByTestId('priority-review-due-banner')).toBeNull()
    })

    expect(screen.getByTestId('priority-review-suggestion-dprs-1')).toBeDefined()
  })
})
