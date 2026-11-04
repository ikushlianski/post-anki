import { describe, expect, it } from 'vitest'

import { formatNextDue } from './format-next-due'

const NOW = new Date('2026-10-26T10:00:00Z')

describe('formatNextDue', () => {
  it('should say minutes when the next card is under an hour away', () => {
    expect(formatNextDue('2026-10-26T10:20:00Z', NOW)).toBe('in 20 min')
  })

  it('should say hours when the next card is later today', () => {
    expect(formatNextDue('2026-10-26T11:00:00Z', NOW)).toBe('in 1 hour')
  })

  it('should say days when the next card is more than a day away', () => {
    expect(formatNextDue('2026-10-29T10:00:00Z', NOW)).toBe('in 3 days')
  })
})
