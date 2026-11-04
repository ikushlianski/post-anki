import { describe, expect, it } from 'vitest'

import { describeDelta } from './weekly-digest-card-delta'

describe('describeDelta', () => {
  it('should say up with the exact gain when this week beats last week', () => {
    expect(describeDelta(8, 5)).toBe('up 3 from last week')
  })

  it('should say down with the exact drop when this week trails last week', () => {
    expect(describeDelta(2, 6)).toBe('down 4 from last week')
  })

  it('should say same when both weeks match', () => {
    expect(describeDelta(4, 4)).toBe('same as last week')
  })
})
