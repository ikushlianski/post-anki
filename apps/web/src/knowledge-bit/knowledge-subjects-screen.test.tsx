// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import type { ReactNode } from 'react'

vi.mock('@tanstack/react-router', () => ({
  Link: ({ children, to: _to, ...rest }: { children: ReactNode; to?: string } & Record<string, unknown>) => (
    <a href="#" {...rest}>
      {children}
    </a>
  ),
}))
vi.mock('./knowledge-browser-subject-list', () => ({
  NO_SUBJECT_PARAM: 'none',
  KnowledgeBrowserSubjectList: () => <p data-testid="subject-list" />,
}))
vi.mock('../knowledge-source/add-knowledge-button', () => ({ AddKnowledgeButton: () => null }))
vi.mock('./use-knowledge-overview-subjects', () => ({
  useKnowledgeOverviewSubjects: () => ({ options: [], labelFor: () => '' }),
}))

import { KnowledgeSubjectsScreen } from './knowledge-subjects-screen'

afterEach(cleanup)

describe('KnowledgeSubjectsScreen', () => {
  it('should show the Subjects heading and the subject list on its own page', () => {
    render(<KnowledgeSubjectsScreen />)

    expect(screen.getByRole('heading', { name: 'Subjects' })).toBeTruthy()
    expect(screen.getByTestId('subject-list')).toBeTruthy()
  })
})
