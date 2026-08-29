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
  modelTier: null,
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
  modelTier: null,
  categoryId: null,
}

describe('SubjectSection', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('should show the unified add-material action for architecture-mentor subjects', () => {
    render(
      <SubjectSection subject={SUBJECT} curricula={[]} allSubjects={[SUBJECT]} globalModelTier="cheap" />,
    )

    expect(screen.getByTestId('create-material-toggle')).toBeDefined()
  })

  it('should display curriculum when provided', () => {
    render(
      <SubjectSection
        subject={SUBJECT}
        curricula={[CURRICULUM]}
        allSubjects={[SUBJECT]}
        globalModelTier="cheap"
      />,
    )

    expect(screen.getByTestId('curriculum-name').textContent).toBe('System Design')
  })
})
