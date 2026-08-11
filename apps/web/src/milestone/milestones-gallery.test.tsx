// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'

import type { Milestone } from '@post-anki/shared'

import { MilestonesGallery } from './milestones-gallery'

afterEach(cleanup)

function milestone(overrides: Partial<Milestone>): Milestone {
  return {
    id: 'm1',
    entityType: 'curriculum',
    entityId: 'curriculum-1',
    entityLabel: 'React Effects & Synchronization',
    criteriaKey: 'full_mastery',
    achievedAt: '2026-08-01T00:00:00.000Z',
    createdAt: '2026-08-01T00:00:00.000Z',
    ...overrides,
  }
}

describe('MilestonesGallery', () => {
  it('should show a neutral empty state, never a guilt-inducing "0 milestones" framing', () => {
    render(<MilestonesGallery milestones={[]} />)

    const empty = screen.getByTestId('milestones-empty')

    expect(empty.textContent).not.toMatch(/get started|0 milestones|hurry/i)
  })

  it('should render only what was achieved and when — no percent, no next-milestone hint', () => {
    render(<MilestonesGallery milestones={[milestone({})]} />)

    const card = screen.getByTestId('milestone-card')

    expect(card.textContent).toContain('React Effects & Synchronization')
    expect(card.textContent).toContain('Fully mastered')
    expect(card.textContent).not.toMatch(/%|percent|next milestone|more to go|at risk/i)
  })

  it('should label an Area milestone distinctly from a curriculum one', () => {
    render(
      <MilestonesGallery
        milestones={[
          milestone({ id: 'm1', entityType: 'curriculum' }),
          milestone({ id: 'm2', entityType: 'domain_node', entityLabel: 'State Management' }),
        ]}
      />,
    )

    const cards = screen.getAllByTestId('milestone-card')

    expect(cards[0]!.textContent).toContain('Curriculum')
    expect(cards[1]!.textContent).toContain('Area')
  })

  it('should show the newest achievement first', () => {
    render(
      <MilestonesGallery
        milestones={[
          milestone({ id: 'old', entityLabel: 'Old one', achievedAt: '2026-01-01T00:00:00.000Z' }),
          milestone({ id: 'new', entityLabel: 'New one', achievedAt: '2026-08-01T00:00:00.000Z' }),
        ]}
      />,
    )

    const cards = screen.getAllByTestId('milestone-card')

    expect(cards[0]!.textContent).toContain('New one')
    expect(cards[1]!.textContent).toContain('Old one')
  })

  it('should render a milestone whose underlying entity was deleted, without crashing', () => {
    render(<MilestonesGallery milestones={[milestone({ entityLabel: null })]} />)

    expect(screen.getByTestId('milestone-card')).toBeTruthy()
  })
})
