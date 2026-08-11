import { describe, expect, it } from 'vitest'

import { coverageBand } from './coverage-band'

describe('coverageBand', () => {
  it('bands a gap Area as "no-data", never on the progress ramp at all', () => {
    expect(coverageBand('gap', 0)).toBe('no-data')
  })

  it('bands a zero-percent progress Area as "low", distinct from "no-data"', () => {
    expect(coverageBand('progress', 0)).toBe('low')
  })

  it('bands a fully mastered Area as "high"', () => {
    expect(coverageBand('progress', 100)).toBe('high')
  })

  it('bands intermediate percentages into the middle steps', () => {
    expect(coverageBand('progress', 25)).toBe('mid-low')
    expect(coverageBand('progress', 45)).toBe('mid')
    expect(coverageBand('progress', 65)).toBe('mid-high')
  })
})
