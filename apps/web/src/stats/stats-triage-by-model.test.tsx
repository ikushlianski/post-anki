import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import { spendFixture } from './stats.fixtures'
import { StatsTriageByModel } from './stats-triage-by-model'

describe('StatsTriageByModel', () => {
  it('should show how many candidates of each model were kept and rejected', () => {
    render(<StatsTriageByModel rows={spendFixture.triageByModel} />)

    const row = screen.getByTestId('triage-by-model-anthropic/claude-x')

    expect(row.textContent).toBe('anthropic/claude-x59')
  })

  it('should say there are no fusion decisions when none were made', () => {
    render(<StatsTriageByModel rows={[]} />)

    expect(screen.getByTestId('triage-by-model-empty')).toBeTruthy()
  })
})
