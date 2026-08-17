// @vitest-environment jsdom
import type { ReactNode } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'

import type { LearningPath } from '@post-anki/shared'

vi.mock('@tanstack/react-router', () => ({
  Link: ({ children, ...rest }: { children: ReactNode }) => <a {...rest}>{children}</a>,
}))

import { LearningPathList } from './learning-path-list'

afterEach(cleanup)

function path(overrides: Partial<LearningPath>): LearningPath {
  return {
    id: 'path-1',
    name: 'Frontend Engineer',
    targetRoleLabel: 'Frontend Engineer',
    status: 'active',
    createdAt: '2026-08-01T00:00:00.000Z',
    startedAt: '2026-08-01T00:00:00.000Z',
    completedAt: null,
    ...overrides,
  }
}

describe('LearningPathList', () => {
  it('should show a neutral empty state, not a guilt-inducing one', () => {
    render(<LearningPathList paths={[]} />)

    const empty = screen.getByTestId('learning-path-list-empty')

    expect(empty.textContent).not.toMatch(/get started|hurry|overdue/i)
  })

  it('should list every path with its status', () => {
    render(
      <LearningPathList
        paths={[path({ id: 'p1', status: 'active' }), path({ id: 'p2', status: 'completed' })]}
      />,
    )

    expect(screen.getAllByTestId('learning-path-list-item')).toHaveLength(2)
    expect(screen.getByText('In progress')).toBeTruthy()
    expect(screen.getByText('Completed')).toBeTruthy()
  })
})
