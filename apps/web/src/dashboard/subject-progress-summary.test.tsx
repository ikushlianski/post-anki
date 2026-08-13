import { describe, it, expect } from 'vitest'
import { render } from '@testing-library/react'

import { SubjectProgressSummary } from './subject-progress-summary'

describe('SubjectProgressSummary', () => {
  it('renders progress bar with average percent', () => {
    const { container } = render(
      <SubjectProgressSummary curriculumCount={3} averagePercent={65} />
    )
    const progressDiv = container.querySelector('div[style]')
    expect(progressDiv?.getAttribute('style')).toContain('width: 65%')
  })

  it('displays curriculum count', () => {
    const { getByText } = render(
      <SubjectProgressSummary curriculumCount={5} averagePercent={50} />
    )
    expect(getByText('5 courses')).toBeDefined()
  })

  it('displays average percent', () => {
    const { getByText } = render(
      <SubjectProgressSummary curriculumCount={3} averagePercent={75} />
    )
    expect(getByText('75% average')).toBeDefined()
  })

  it('renders single curriculum', () => {
    const { getByText } = render(
      <SubjectProgressSummary curriculumCount={1} averagePercent={40} />
    )
    expect(getByText('1 courses')).toBeDefined()
    expect(getByText('40% average')).toBeDefined()
  })

  it('renders zero progress', () => {
    const { getByText, container } = render(
      <SubjectProgressSummary curriculumCount={2} averagePercent={0} />
    )
    const progressDiv = container.querySelector('div[style]')
    expect(progressDiv?.getAttribute('style')).toContain('width: 0%')
    expect(getByText('2 courses')).toBeDefined()
    expect(getByText('0% average')).toBeDefined()
  })
})
