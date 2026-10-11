// @vitest-environment jsdom
import type { ReactNode } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'

import { KnowledgeBitReviewEmptyState } from './knowledge-bit-review-empty-state'

vi.mock('@tanstack/react-router', () => ({
  Link: ({ to, children, ...rest }: { to: string; children: ReactNode } & Record<string, unknown>) => (
    <a href={to} {...rest}>
      {children}
    </a>
  ),
}))

describe('KnowledgeBitReviewEmptyState', () => {
  afterEach(() => {
    cleanup()
  })

  it('should say everything is decided and link to add knowledge and to review', () => {
    render(<KnowledgeBitReviewEmptyState />)

    expect(screen.getByTestId('knowledge-bit-review-empty-state').textContent).toContain(
      'No pending knowledge bits. Everything is decided.',
    )
    expect(screen.getByRole('link', { name: 'Add knowledge' }).getAttribute('href')).toBe(
      '/add-knowledge',
    )
    expect(screen.getByRole('link', { name: 'Review' }).getAttribute('href')).toBe(
      '/knowledge/review',
    )
  })
})
