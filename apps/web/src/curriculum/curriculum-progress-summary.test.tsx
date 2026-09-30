// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'

import type { CurriculumProgress } from './model'
import { CurriculumProgressSummary } from './curriculum-progress-summary'

function progress(overrides: Partial<CurriculumProgress> = {}): CurriculumProgress {
  return { topicsIncluded: 10, topicsMastered: 4, percent: 40, ...overrides }
}

describe('CurriculumProgressSummary', () => {
  afterEach(cleanup)

  it('shows the curriculum-level due count next to its progress', () => {
    render(
      <CurriculumProgressSummary status="confirmed" progress={progress()} dueCount={7} />,
    )

    expect(screen.getByText(/·\s*7 due/)).toBeDefined()
  })

  it('shows zero due bits as caught up rather than omitting the count', () => {
    render(
      <CurriculumProgressSummary status="confirmed" progress={progress()} dueCount={0} />,
    )

    expect(screen.getByText(/·\s*0 due/)).toBeDefined()
  })
})
