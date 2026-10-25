// @vitest-environment jsdom
import { useState } from 'react'
import { afterEach, describe, expect, it } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'

import { Tabs } from './tabs'

const TABS = [
  { id: 'text', label: 'Paste text', testId: 'tab-text' },
  { id: 'url', label: 'Add link', testId: 'tab-url' },
] as const

function Harness({ disabled }: { disabled?: boolean }) {
  const [value, setValue] = useState<'text' | 'url'>('text')

  return (
    <Tabs tabs={TABS} value={value} onChange={setValue} ariaLabel="Source type" disabled={disabled}>
      <p>{value === 'text' ? 'Text panel' : 'Link panel'}</p>
    </Tabs>
  )
}

describe('Tabs', () => {
  afterEach(cleanup)

  it('should mark only the chosen tab as selected and show its panel', () => {
    render(<Harness />)

    expect(screen.getByTestId('tab-text').getAttribute('aria-selected')).toBe('true')
    expect(screen.getByTestId('tab-url').getAttribute('aria-selected')).toBe('false')
    expect(screen.getByRole('tabpanel').textContent).toBe('Text panel')
  })

  it('should switch the panel when another tab is clicked', () => {
    render(<Harness />)

    fireEvent.click(screen.getByTestId('tab-url'))

    expect(screen.getByRole('tabpanel').textContent).toBe('Link panel')
    expect(screen.getByRole('tabpanel').getAttribute('aria-labelledby')).toBe(screen.getByTestId('tab-url').id)
  })

  it('should move between tabs with the arrow keys and wrap around', () => {
    render(<Harness />)

    fireEvent.keyDown(screen.getByTestId('tab-text'), { key: 'ArrowRight' })

    expect(screen.getByTestId('tab-url').getAttribute('aria-selected')).toBe('true')
    expect(document.activeElement).toBe(screen.getByTestId('tab-url'))

    fireEvent.keyDown(screen.getByTestId('tab-url'), { key: 'ArrowRight' })

    expect(screen.getByTestId('tab-text').getAttribute('aria-selected')).toBe('true')
  })

  it('should keep only the selected tab in the tab order', () => {
    render(<Harness />)

    expect(screen.getByTestId('tab-text').tabIndex).toBe(0)
    expect(screen.getByTestId('tab-url').tabIndex).toBe(-1)
  })

  it('should not allow switching while disabled', () => {
    render(<Harness disabled />)

    expect((screen.getByTestId('tab-url') as HTMLButtonElement).disabled).toBe(true)
  })
})
