import { describe, expect, it } from 'vitest'

import { formatElapsedClock, formatPlannedDuration } from './session-timer'

describe('formatElapsedClock', () => {
  it('formats sub-hour durations as minutes only', () => {
    expect(formatElapsedClock(17)).toBe('17m')
  })

  it('formats durations of an hour or more with hours and minutes', () => {
    expect(formatElapsedClock(75)).toBe('1h 15m')
  })

  it('never shows a negative elapsed time', () => {
    expect(formatElapsedClock(-5)).toBe('0m')
  })
})

describe('formatPlannedDuration', () => {
  it('renders the planned duration in minutes', () => {
    expect(formatPlannedDuration(20)).toBe('20 min')
  })
})
