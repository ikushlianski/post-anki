// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest'
import { cleanup, render, screen, waitFor } from '@testing-library/react'
import type { ReactNode } from 'react'
import type { DomainRecommendation } from '@post-anki/shared'

import { RecommendationPanel } from './recommendation-panel'
import { resolveRecommendation } from './domain-recommendation.api'

vi.mock('@tanstack/react-router', () => ({
  Link: ({ children }: { children: ReactNode }) => <a href="#">{children}</a>,
}))

vi.mock('./domain-recommendation.api', () => ({
  resolveRecommendation: vi.fn(),
}))

const mockedResolveRecommendation = vi.mocked(resolveRecommendation)

afterEach(() => {
  cleanup()
})

const PENDING_DEEPEN: DomainRecommendation = {
  id: 'domainrec-1',
  subjectId: 'sub-1',
  domainNodeId: 'dnode-dns',
  sourceNodeId: 'dnode-tcpip',
  axis: 'deepen',
  reason: 'You\'ve mastered "TCP/IP" (92%) — "DNS" is the next step within it.',
  source: 'structural',
  status: 'pending',
  createdAt: '2026-08-01T00:00:00.000Z',
  resolvedAt: null,
  createdCurriculumId: null,
}

const PENDING_WIDEN: DomainRecommendation = {
  id: 'domainrec-2',
  subjectId: 'sub-1',
  domainNodeId: 'dnode-cloud',
  sourceNodeId: 'dnode-networking',
  axis: 'widen',
  reason: '"Networking" is actively being studied while "Cloud Computing" hasn\'t been started yet.',
  source: 'structural',
  status: 'pending',
  createdAt: '2026-08-01T00:00:00.000Z',
  resolvedAt: null,
  createdCurriculumId: null,
}

function renderPanel(initial: DomainRecommendation[] = [PENDING_DEEPEN, PENDING_WIDEN]) {
  return render(
    <RecommendationPanel
      initialRecommendations={initial}
      nodeNamesById={{ 'dnode-dns': 'DNS', 'dnode-cloud': 'Cloud Computing' }}
    />,
  )
}

// AC 29.
describe('RecommendationPanel — rendering', () => {
  it('renders one entry per pending recommendation with an axis badge, reason text, and accept/reject buttons', () => {
    renderPanel()

    expect(screen.getByTestId('recommendation-domainrec-1')).toBeDefined()
    expect(screen.getByTestId('recommendation-axis-domainrec-1').textContent).toBe('Deepen')
    expect(screen.getByTestId('recommendation-reason-domainrec-1').textContent).toBe(
      PENDING_DEEPEN.reason,
    )
    expect(screen.getByTestId('recommendation-accept-domainrec-1')).toBeDefined()
    expect(screen.getByTestId('recommendation-reject-domainrec-1')).toBeDefined()

    expect(screen.getByTestId('recommendation-domainrec-2')).toBeDefined()
    expect(screen.getByTestId('recommendation-axis-domainrec-2').textContent).toBe('Widen')
    expect(screen.getByTestId('recommendation-reason-domainrec-2').textContent).toBe(
      PENDING_WIDEN.reason,
    )
  })

  it('shows a fallback message when there are no pending recommendations', () => {
    renderPanel([])

    expect(screen.getByText('No pending recommendations.')).toBeDefined()
  })
})

// AC 30.
describe('RecommendationPanel — accept', () => {
  it('calls resolve with accepted, removes the item, and shows a confirmation linking to the new curriculum', async () => {
    mockedResolveRecommendation.mockReset()
    mockedResolveRecommendation.mockResolvedValue({
      outcome: 'resolved',
      suggestion: { ...PENDING_DEEPEN, status: 'accepted', createdCurriculumId: 'cur-123' },
    })

    renderPanel([PENDING_DEEPEN])

    screen.getByTestId('recommendation-accept-domainrec-1').click()

    expect(mockedResolveRecommendation).toHaveBeenCalledWith({
      data: { recommendationId: 'domainrec-1', status: 'accepted' },
    })

    await waitFor(() => {
      expect(screen.queryByTestId('recommendation-domainrec-1')).toBeNull()
    })

    expect(screen.getByTestId('recommendation-confirmation').textContent).toContain(
      'Course created:',
    )
    expect(screen.getByTestId('recommendation-confirmation').textContent).toContain('DNS')
  })

  it('does not show a confirmation when accept resolves as already_resolved (a second tab won the claim)', async () => {
    mockedResolveRecommendation.mockReset()
    mockedResolveRecommendation.mockResolvedValue({ outcome: 'already_resolved' })

    renderPanel([PENDING_DEEPEN])

    screen.getByTestId('recommendation-accept-domainrec-1').click()

    await waitFor(() => {
      expect(screen.queryByTestId('recommendation-domainrec-1')).toBeNull()
    })

    expect(screen.queryByTestId('recommendation-confirmation')).toBeNull()
  })
})

// AC 31.
describe('RecommendationPanel — reject', () => {
  it('calls resolve with rejected, removes the item, and shows no confirmation', async () => {
    mockedResolveRecommendation.mockReset()
    mockedResolveRecommendation.mockResolvedValue({
      outcome: 'resolved',
      suggestion: { ...PENDING_DEEPEN, status: 'rejected' },
    })

    renderPanel([PENDING_DEEPEN])

    screen.getByTestId('recommendation-reject-domainrec-1').click()

    expect(mockedResolveRecommendation).toHaveBeenCalledWith({
      data: { recommendationId: 'domainrec-1', status: 'rejected' },
    })

    await waitFor(() => {
      expect(screen.queryByTestId('recommendation-domainrec-1')).toBeNull()
    })

    expect(screen.queryByTestId('recommendation-confirmation')).toBeNull()
  })

  it('sends exactly one request when a button is double-clicked before the first resolves', async () => {
    let resolveRequest: (() => void) | undefined
    mockedResolveRecommendation.mockReset()
    mockedResolveRecommendation.mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveRequest = () =>
            resolve({ outcome: 'resolved', suggestion: { ...PENDING_DEEPEN, status: 'rejected' } })
        }),
    )

    renderPanel([PENDING_DEEPEN])

    const reject = screen.getByTestId('recommendation-reject-domainrec-1') as HTMLButtonElement

    reject.click()
    reject.click()

    expect(mockedResolveRecommendation).toHaveBeenCalledTimes(1)

    resolveRequest?.()

    await waitFor(() => {
      expect(screen.queryByTestId('recommendation-domainrec-1')).toBeNull()
    })
  })

  it('disables both row buttons while a request is in flight', async () => {
    mockedResolveRecommendation.mockReset()
    mockedResolveRecommendation.mockImplementation(() => new Promise(() => {}))

    renderPanel([PENDING_DEEPEN])

    const accept = screen.getByTestId('recommendation-accept-domainrec-1') as HTMLButtonElement
    const reject = screen.getByTestId('recommendation-reject-domainrec-1') as HTMLButtonElement

    expect(accept.disabled).toBe(false)

    accept.click()

    await waitFor(() => {
      expect(accept.disabled).toBe(true)
    })

    expect(reject.disabled).toBe(true)
  })

  it('re-enables the row and keeps it listed when the request fails, so the decision can be retried', async () => {
    mockedResolveRecommendation.mockReset()
    mockedResolveRecommendation.mockRejectedValue(new Error('Conflict'))

    renderPanel([PENDING_DEEPEN])

    const accept = screen.getByTestId('recommendation-accept-domainrec-1') as HTMLButtonElement

    accept.click()

    await waitFor(() => {
      expect(accept.disabled).toBe(false)
    })

    expect(screen.getByTestId('recommendation-domainrec-1')).toBeDefined()
    expect(mockedResolveRecommendation).toHaveBeenCalledTimes(1)
  })
})
