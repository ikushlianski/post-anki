// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'

vi.mock('@tanstack/react-router', () => ({
  Link: ({ children, params }: { children: React.ReactNode; params: { subjectId: string } }) => (
    <a href={`/subject/${params.subjectId}`}>{children}</a>
  ),
}))

import { SubjectBreadcrumb, subjectAncestors } from './subject-breadcrumb'

const tree = [
  { id: 'biz', name: 'Business', parentId: null },
  { id: 'sales', name: 'Sales', parentId: 'biz' },
  { id: 'cold', name: 'Cold sales', parentId: 'sales' },
]

afterEach(() => {
  cleanup()
})

describe('subjectAncestors', () => {
  it('should list parents from the top level down for a nested subject', () => {
    expect(subjectAncestors(tree, 'cold').map((s) => s.name)).toEqual(['Business', 'Sales'])
  })

  it('should return nothing for a top-level subject', () => {
    expect(subjectAncestors(tree, 'biz')).toEqual([])
  })
})

describe('SubjectBreadcrumb', () => {
  it('should show linked parent subjects above a nested subject', () => {
    render(<SubjectBreadcrumb subjects={tree} subjectId="cold" />)

    expect(screen.getByTestId('subject-breadcrumb').textContent).toBe('Business › Sales')
    expect(screen.getByText('Sales').getAttribute('href')).toBe('/subject/sales')
  })

  it('should render nothing for a top-level subject', () => {
    render(<SubjectBreadcrumb subjects={tree} subjectId="biz" />)

    expect(screen.queryByTestId('subject-breadcrumb')).toBeNull()
  })
})
