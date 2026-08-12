import { describe, it, expect } from 'vitest'
import { render } from '@testing-library/react'

import { CurriculumProgressRow } from './curriculum-progress-row'

describe('CurriculumProgressRow', () => {
  it('renders progress bar with correct percent', () => {
    const { container } = render(
      <CurriculumProgressRow topicsMastered={3} topicsIncluded={5} percent={60} />
    )
    const progressDiv = container.querySelector('div[style]')
    expect(progressDiv?.getAttribute('style')).toContain('width: 60%')
  })

  it('displays mastered count', () => {
    const { getByText } = render(
      <CurriculumProgressRow topicsMastered={7} topicsIncluded={10} percent={70} />
    )
    expect(getByText('7/10 mastered')).toBeDefined()
  })

  it('displays percent text', () => {
    const { getByText } = render(
      <CurriculumProgressRow topicsMastered={3} topicsIncluded={5} percent={60} />
    )
    expect(getByText('60%')).toBeDefined()
  })

  it('renders zero progress', () => {
    const { getByText } = render(
      <CurriculumProgressRow topicsMastered={0} topicsIncluded={5} percent={0} />
    )
    expect(getByText('0/5 mastered')).toBeDefined()
    expect(getByText('0%')).toBeDefined()
  })

  it('renders 100 percent progress', () => {
    const { getByText, container } = render(
      <CurriculumProgressRow topicsMastered={5} topicsIncluded={5} percent={100} />
    )
    const progressDiv = container.querySelector('div[style]')
    expect(progressDiv?.getAttribute('style')).toContain('width: 100%')
    expect(getByText('5/5 mastered')).toBeDefined()
    expect(getByText('100%')).toBeDefined()
  })
})
