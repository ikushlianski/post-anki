// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import type { ReactNode } from 'react'

import type { Curriculum, Subject } from '../curriculum/model'
import { SubjectSection } from './subject-section'

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
    'data-testid': string
  }) => (
    <a
      href={to}
      data-testid={testId}
      data-params={JSON.stringify(params)}
    >
      {children}
    </a>
  ),
  useRouter: () => ({
    invalidate: vi.fn().mockResolvedValue(undefined),
  }),
}))

vi.mock('../subject/subject.api')
vi.mock('../curriculum/curriculum.api')
vi.mock('../shared/use-hydrated', () => ({
  useHydrated: () => true,
}))

afterEach(cleanup)

const SUBJECT_ID = 'subj-1'
const SUBJECT: Subject = {
  id: SUBJECT_ID,
  name: 'Architecture Patterns',
  kind: 'architecture-mentor',
  requireSources: true,
}

const CURRICULUM: Curriculum = {
  id: 'curr-1',
  name: 'System Design',
  subjectId: SUBJECT_ID,
  status: 'confirmed',
  learningStatus: 'not_started',
  speed: 'normal',
  hinting: true,
  defaultDepth: 'working',
  origin: 'research',
  strictOrder: false,
  preAssessmentCompletedAt: null,
  domainNodeId: null,
  order: 1,
}

describe('SubjectSection', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('should render knowledge map link for architecture-mentor subjects', () => {
    render(
      <SubjectSection subject={SUBJECT} curricula={[]} allSubjects={[SUBJECT]} />,
    )

    const link = screen.getByTestId('knowledge-map-link')
    expect(link).toBeDefined()
    expect(link.textContent).toContain('Knowledge map')
  })

  it('should render priority review link for architecture-mentor subjects', () => {
    render(
      <SubjectSection subject={SUBJECT} curricula={[]} allSubjects={[SUBJECT]} />,
    )

    const link = screen.getByTestId('priority-review-link')
    expect(link).toBeDefined()
    expect(link.textContent).toContain('Priority review')
  })

  it('should pass correct subjectId parameter to knowledge map link', () => {
    render(
      <SubjectSection subject={SUBJECT} curricula={[]} allSubjects={[SUBJECT]} />,
    )

    const link = screen.getByTestId('knowledge-map-link')
    const params = JSON.parse(link.getAttribute('data-params') || '{}')
    expect(params.subjectId).toBe(SUBJECT_ID)
  })

  it('should pass correct subjectId parameter to priority review link', () => {
    render(
      <SubjectSection subject={SUBJECT} curricula={[]} allSubjects={[SUBJECT]} />,
    )

    const link = screen.getByTestId('priority-review-link')
    const params = JSON.parse(link.getAttribute('data-params') || '{}')
    expect(params.subjectId).toBe(SUBJECT_ID)
  })

  it('should display subject name', () => {
    render(
      <SubjectSection subject={SUBJECT} curricula={[]} allSubjects={[SUBJECT]} />,
    )

    expect(screen.getByTestId('subject-name').textContent).toBe('Architecture Patterns')
  })

  it('should display curriculum when provided', () => {
    render(
      <SubjectSection
        subject={SUBJECT}
        curricula={[CURRICULUM]}
        allSubjects={[SUBJECT]}
      />,
    )

    expect(screen.getByTestId('curriculum-name').textContent).toBe('System Design')
  })
})
