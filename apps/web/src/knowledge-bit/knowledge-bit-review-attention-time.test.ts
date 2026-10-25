import { describe, expect, it } from 'vitest'

import { formatAttentionAge } from './knowledge-bit-review-attention-time'

const NOW = new Date('2026-10-25T12:00:00.000Z')

describe('formatAttentionAge', () => {
  it('should say just now for a note that failed seconds ago', () => {
    expect(formatAttentionAge('2026-10-25T11:59:40.000Z', NOW)).toBe('just now')
  })

  it('should count minutes for a note that failed 5 minutes ago', () => {
    expect(formatAttentionAge('2026-10-25T11:55:00.000Z', NOW)).toBe('5 minutes ago')
  })

  it('should use the singular for exactly one hour', () => {
    expect(formatAttentionAge('2026-10-25T11:00:00.000Z', NOW)).toBe('1 hour ago')
  })

  it('should count days for a note that has waited since the day before yesterday', () => {
    expect(formatAttentionAge('2026-10-23T11:00:00.000Z', NOW)).toBe('2 days ago')
  })

  it('should not show a broken time for an unreadable date', () => {
    expect(formatAttentionAge('not a date', NOW)).toBe('just now')
  })
})
