// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'

vi.mock('@tanstack/react-router', () => ({
  Link: ({ to, search, children, ...rest }: { to: string; search?: Record<string, string>; children: React.ReactNode }) => (
    <a href={`${to}${search?.subjectId ? `?subjectId=${search.subjectId}` : ''}`} {...rest}>
      {children}
    </a>
  ),
}))

import { AddKnowledgeButton } from './add-knowledge-button'

afterEach(cleanup)

describe('AddKnowledgeButton', () => {
  it('should open the add knowledge page', () => {
    render(<AddKnowledgeButton />)

    expect(screen.getByTestId('add-knowledge-button').getAttribute('href')).toBe('/add-knowledge')
  })

  it('should carry the subject so new knowledge lands in the subject being browsed', () => {
    render(<AddKnowledgeButton subjectId="s1" />)

    expect(screen.getByTestId('add-knowledge-button').getAttribute('href')).toBe('/add-knowledge?subjectId=s1')
  })
})
