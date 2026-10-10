// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import type { ReactNode } from 'react'

vi.mock('@tanstack/react-router', () => ({
  Link: ({
    children,
    to,
    activeOptions: _activeOptions,
    ...rest
  }: {
    children: ReactNode
    to?: string
    activeOptions?: unknown
  } & Record<string, unknown>) => (
    <a href="#" data-to={to} {...rest}>
      {children}
    </a>
  ),
}))

vi.mock('@tanstack/react-db', () => ({
  useLiveQuery: () => ({ data: [] }),
}))

vi.mock('../curriculum/board.collection', () => ({
  curriculaCollection: {},
}))

vi.mock('../knowledge-bit/knowledge-bit-review.api', () => ({
  getPendingKnowledgeBitCountForNav: vi.fn(async () => ({ count: 0 })),
}))

import { Sidebar } from './sidebar'

afterEach(() => {
  cleanup()
})

describe('Sidebar', () => {
  it('should link Suspended cards to its page directly after Review', () => {
    render(<Sidebar />)

    const review = screen.getByTestId('nav-knowledge-review')
    const suspended = screen.getByTestId('nav-knowledge-suspended')

    expect(suspended.textContent).toBe('Suspended cards')
    expect(suspended.getAttribute('data-to')).toBe('/knowledge/suspended')
    expect(review.compareDocumentPosition(suspended) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()

    const answer = screen.getByTestId('nav-knowledge-answer')

    expect(suspended.compareDocumentPosition(answer) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
  })
})
