// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { renderToString } from 'react-dom/server'
import { cleanup, render, screen } from '@testing-library/react'
import type { ReactNode } from 'react'

vi.mock('@tanstack/react-router', () => ({
  Link: ({
    children,
    to,
    search,
    ...rest
  }: { children: ReactNode; to?: string; search?: unknown } & Record<string, unknown>) => (
    <a href="#" data-to={to} data-search={JSON.stringify(search)} {...rest}>
      {children}
    </a>
  ),
}))

vi.mock('../knowledge-bit/use-knowledge-overview-subjects', () => ({
  useKnowledgeOverviewSubjects: vi.fn(),
}))

vi.mock('../knowledge-bit/use-knowledge-browser-data', () => ({
  useKnowledgeBrowserSubjectCounts: vi.fn(),
}))

import { useKnowledgeBrowserSubjectCounts } from '../knowledge-bit/use-knowledge-browser-data'
import { useKnowledgeOverviewSubjects } from '../knowledge-bit/use-knowledge-overview-subjects'
import { SIDEBAR_SUBJECTS_LIMIT, SidebarSubjects } from './sidebar-subjects'

afterEach(cleanup)

function givenSubjects(options: { id: string; label: string }[], count = 3) {
  vi.mocked(useKnowledgeOverviewSubjects).mockReturnValue({ options, labelFor: () => '' })
  vi.mocked(useKnowledgeBrowserSubjectCounts).mockReturnValue({
    counts: options.map((option) => ({ subjectId: option.id, count })),
    isPending: false,
    isError: false,
    retry: () => {},
  })
}

describe('SidebarSubjects', () => {
  it('should link each top-level subject to its slice of the knowledge browser', () => {
    givenSubjects([
      { id: 's1', label: 'Math' },
      { id: 's2', label: 'Math / Algebra' },
      { id: 's3', label: 'Physics' },
    ])

    render(<SidebarSubjects />)

    const math = screen.getByTestId('sidebar-subject-s1')

    expect(math.getAttribute('data-to')).toBe('/knowledge/browser')
    expect(JSON.parse(math.getAttribute('data-search') ?? '{}')).toEqual({ subject: 's1' })
    expect(screen.getByTestId('sidebar-subject-s3').textContent).toBe('Physics')
    expect(screen.queryByTestId('sidebar-subject-s2')).toBeNull()
  })

  it('should cap the list so a long subject collection does not push the menu away', () => {
    givenSubjects(Array.from({ length: 30 }, (_, i) => ({ id: `s${i}`, label: `Subject ${i}` })))

    render(<SidebarSubjects />)

    expect(screen.getAllByRole('link')).toHaveLength(SIDEBAR_SUBJECTS_LIMIT)
    expect(screen.getByTestId('sidebar-subjects').className).toContain('overflow-y-auto')
  })

  it('should show nothing when there is no knowledge yet', () => {
    givenSubjects([])

    const { container } = render(<SidebarSubjects />)

    expect(container.innerHTML).toBe('')
  })

  it('should render on the server without touching the live subject data', () => {
    vi.mocked(useKnowledgeOverviewSubjects).mockImplementation(() => {
      throw new Error('Missing getServerSnapshot')
    })

    expect(renderToString(<SidebarSubjects />)).toBe('')
  })
})
