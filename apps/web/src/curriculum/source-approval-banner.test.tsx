// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import type { ReactNode } from 'react'

import type { Curriculum } from './model'
import { SourceApprovalBanner } from './source-approval-banner'

vi.mock('@tanstack/react-router', () => ({
  Link: ({
    to,
    params,
    children,
    'data-testid': testId,
  }: {
    to: string
    params: Record<string, string>
    children: ReactNode
    'data-testid'?: string
  }) => (
    <a href={to} data-testid={testId} data-params={JSON.stringify(params)}>
      {children}
    </a>
  ),
}))

function curriculum(overrides: Partial<Curriculum>): Curriculum {
  return {
    id: 'curr-1',
    subjectId: 'subj-1',
    name: 'System Design',
    status: 'confirmed',
    learningStatus: 'not_started',
    speed: 'normal',
    hinting: true,
    defaultDepth: 'working',
    origin: 'research',
    strictOrder: false,
    preAssessmentCompletedAt: null,
    domainNodeId: null,
    order: 0,
    modelTier: null,
    categoryId: null,
    ...overrides,
  }
}

describe('SourceApprovalBanner', () => {
  it('renders nothing when no course is awaiting source approval', () => {
    const { container } = render(
      <SourceApprovalBanner
        curricula={[curriculum({ status: 'confirmed' })]}
      />,
    )

    expect(container.firstChild).toBeNull()
  })

  it('lists every awaiting course with a link to its approval page', () => {
    render(
      <SourceApprovalBanner
        curricula={[
          curriculum({
            id: 'c1',
            name: 'Distributed Systems',
            status: 'awaiting_source_approval',
          }),
          curriculum({
            id: 'c2',
            name: 'Query Optimization',
            status: 'awaiting_source_approval',
          }),
          curriculum({ id: 'c3', name: 'Cache Strategies', status: 'ready' }),
        ]}
      />,
    )

    expect(screen.getByTestId('source-approval-banner')).toBeTruthy()
    expect(screen.getByText(/2 courses awaiting source approval/i)).toBeTruthy()
    expect(screen.getByText('Distributed Systems')).toBeTruthy()
    expect(screen.getByText('Query Optimization')).toBeTruthy()
    expect(screen.queryByText('Cache Strategies')).toBeNull()

    const links = screen.getAllByTestId('source-approval-banner-link')

    expect(links).toHaveLength(2)
    expect(links[0].getAttribute('href')).toBe('/curriculum/$curriculumId')
    expect(links[0].getAttribute('data-params')).toBe(
      JSON.stringify({ curriculumId: 'c1' }),
    )
  })
})
