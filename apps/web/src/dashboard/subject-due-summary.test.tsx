// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import type { ReactNode } from 'react'

import { SubjectDueSummary } from './subject-due-summary'

vi.mock('@tanstack/react-router', () => ({
  Link: ({
    to,
    search,
    children,
    ...rest
  }: {
    to: string
    search?: Record<string, string>
    children: ReactNode
    'data-testid'?: string
  }) => (
    <a href={`${to}?${new URLSearchParams(search ?? {}).toString()}`} {...rest}>
      {children}
    </a>
  ),
}))

afterEach(() => {
  cleanup()
})

describe('SubjectDueSummary', () => {
  it('should show the due count and a Review link scoped to the subject when cards are due', () => {
    render(<SubjectDueSummary subjectId="sub-business" dueCount={4} />)

    expect(screen.getByTestId('subject-due-count-sub-business').textContent).toBe('4 due')
    expect(screen.getByTestId('subject-review-sub-business').textContent).toBe('Review')
    expect(screen.getByTestId('subject-review-sub-business').getAttribute('href')).toBe(
      '/knowledge/review?subjectId=sub-business',
    )
  })

  it('should show a zero due count without a Review action when nothing is due', () => {
    render(<SubjectDueSummary subjectId="sub-business" dueCount={0} />)

    expect(screen.getByTestId('subject-due-count-sub-business').textContent).toBe('0 due')
    expect(screen.queryByTestId('subject-review-sub-business')).toBeNull()
  })
})
