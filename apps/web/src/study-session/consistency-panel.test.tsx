// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'

import { ConsistencyPanel } from './consistency-panel'

afterEach(cleanup)

describe('ConsistencyPanel', () => {
  it('renders planned, completed, and a rounded percent rate', () => {
    render(<ConsistencyPanel consistency={{ planned: 4, completed: 2, rate: 0.5 }} />)

    expect(screen.getByTestId('consistency-completed').textContent).toBe('2')
    expect(screen.getByTestId('consistency-planned').textContent).toBe('4')
    expect(screen.getByTestId('consistency-rate').textContent).toBe('50%')
  })

  it('renders a zero rate without dividing by zero', () => {
    render(<ConsistencyPanel consistency={{ planned: 0, completed: 0, rate: 0 }} />)

    expect(screen.getByTestId('consistency-rate').textContent).toBe('0%')
  })
})
