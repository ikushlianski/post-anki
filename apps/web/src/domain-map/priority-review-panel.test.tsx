// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { cleanup, render, screen, waitFor } from '@testing-library/react'

import type { DomainTopicSuggestion } from '@post-anki/shared'

import { PriorityReviewPanel } from './priority-review-panel'
import { resolveDocScanTopicSuggestion, triggerPriorityReview } from './domain-map.api'

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

const mockedResolveDocScanTopicSuggestion = vi.mocked(resolveDocScanTopicSuggestion)

const PENDING_TOPIC_SUGGESTION: DomainTopicSuggestion = {
  id: 'dtsug-1',
  subjectId: 'sub-1',
  proposedParentNodeId: 'dnode-1',
  proposedNodeName: 'Astro',
  reason: 'Appeared in the tracked changelog content.',
  source: 'doc-scan',
  status: 'pending',
  createdAt: '2026-08-01T00:00:00.000Z',
  resolvedAt: null,
  createdDomainNodeId: null,
}

function renderPanelWithTopicSuggestion() {
  return render(
    <PriorityReviewPanel
      subjectId="sub-1"
      nodeNamesById={{ 'dnode-1': 'Frontend' }}
      initialSuggestions={[]}
      initialDue={false}
      initialNewTopicSuggestions={[PENDING_TOPIC_SUGGESTION]}
      initialSupersessionSuggestions={[]}
    />,
  )
}

describe('PriorityReviewPanel — per-item accept/reject in-flight guard', () => {
  beforeEach(() => {
    mockedResolveDocScanTopicSuggestion.mockReset()
  })

  afterEach(() => {
    cleanup()
  })

  it('sends exactly one request when the accept button is double-clicked', async () => {
    let resolveRequest: (() => void) | undefined
    mockedResolveDocScanTopicSuggestion.mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveRequest = () => resolve(PENDING_TOPIC_SUGGESTION)
        }),
    )

    renderPanelWithTopicSuggestion()

    const accept = screen.getByTestId('doc-scan-new-topic-accept-dtsug-1')

    accept.click()
    accept.click()

    expect(mockedResolveDocScanTopicSuggestion).toHaveBeenCalledTimes(1)

    resolveRequest?.()

    await waitFor(() => {
      expect(screen.queryByTestId('doc-scan-new-topic-dtsug-1')).toBeNull()
    })
  })

  it('disables both of the row buttons while its request is in flight', async () => {
    mockedResolveDocScanTopicSuggestion.mockImplementation(() => new Promise(() => {}))

    renderPanelWithTopicSuggestion()

    const accept = screen.getByTestId('doc-scan-new-topic-accept-dtsug-1') as HTMLButtonElement
    const reject = screen.getByTestId('doc-scan-new-topic-reject-dtsug-1') as HTMLButtonElement

    expect(accept.disabled).toBe(false)

    accept.click()

    await waitFor(() => {
      expect(accept.disabled).toBe(true)
    })

    expect(reject.disabled).toBe(true)
  })

  it('re-enables the row and keeps it listed when the request fails, so the decision can be retried', async () => {
    mockedResolveDocScanTopicSuggestion.mockRejectedValue(new Error('Conflict'))

    renderPanelWithTopicSuggestion()

    const accept = screen.getByTestId('doc-scan-new-topic-accept-dtsug-1') as HTMLButtonElement

    accept.click()

    await waitFor(() => {
      expect(accept.disabled).toBe(false)
    })

    expect(screen.getByTestId('doc-scan-new-topic-dtsug-1')).toBeDefined()
    expect(mockedResolveDocScanTopicSuggestion).toHaveBeenCalledTimes(1)
  })
})
