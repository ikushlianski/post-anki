import { describe, expect, it } from 'vitest'

import { describeIntervalSeconds, formatIntervalSeconds } from './anki-review-interval'

describe('describeIntervalSeconds', () => {
  it('should spell out the interval for a screen reader, in whole units', () => {
    expect(describeIntervalSeconds(30)).toBe('less than a minute')
    expect(describeIntervalSeconds(600)).toBe('10 minutes')
    expect(describeIntervalSeconds(3600)).toBe('1 hour')
    expect(describeIntervalSeconds(86_400)).toBe('1 day')
    expect(describeIntervalSeconds(3 * 86_400)).toBe('3 days')
    expect(describeIntervalSeconds(36 * 86_400)).toBe('1.2 months')
  })
})

describe('formatIntervalSeconds', () => {
  it('should call anything under a minute "<1m"', () => {
    expect(formatIntervalSeconds(0)).toBe('<1m')
    expect(formatIntervalSeconds(59)).toBe('<1m')
  })

  it('should show minutes and hours for same-day intervals', () => {
    expect(formatIntervalSeconds(600)).toBe('10m')
    expect(formatIntervalSeconds(2 * 3600)).toBe('2h')
  })

  it('should show whole days up to a month, like the 1d and 4d a new card gets', () => {
    expect(formatIntervalSeconds(86_400)).toBe('1d')
    expect(formatIntervalSeconds(4 * 86_400)).toBe('4d')
    expect(formatIntervalSeconds(29 * 86_400)).toBe('29d')
  })

  it('should show months with one decimal from 30 days on, dropping a trailing zero', () => {
    expect(formatIntervalSeconds(36 * 86_400)).toBe('1.2mo')
    expect(formatIntervalSeconds(180 * 86_400)).toBe('6mo')
  })
})
