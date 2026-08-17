import { describe, it, expect } from 'vitest'
import { render } from '@testing-library/react'

import { ModuleProgressRow } from './module-progress-row'

describe('ModuleProgressRow', () => {
  it('renders progress bar with correct percent', () => {
    const { container } = render(<ModuleProgressRow percent={65} />)
    const progressDiv = container.querySelector('div[style]')
    expect(progressDiv?.getAttribute('style')).toContain('width: 65%')
  })

  it('displays percent text', () => {
    const { getByText } = render(<ModuleProgressRow percent={42} />)
    expect(getByText('42%')).toBeDefined()
  })

  it('renders zero percent', () => {
    const { container, getByText } = render(<ModuleProgressRow percent={0} />)
    const progressDiv = container.querySelector('div[style]')
    expect(progressDiv?.getAttribute('style')).toContain('width: 0%')
    expect(getByText('0%')).toBeDefined()
  })

  it('renders 100 percent', () => {
    const { container, getByText } = render(<ModuleProgressRow percent={100} />)
    const progressDiv = container.querySelector('div[style]')
    expect(progressDiv?.getAttribute('style')).toContain('width: 100%')
    expect(getByText('100%')).toBeDefined()
  })
})
