import { describe, expect, it } from 'vitest'

import { formatReviewNextDue } from './format-review-next-due'

const now = new Date(2026, 5, 10, 12, 0, 0)

function at(minutes: number): string {
  return new Date(now.getTime() + minutes * 60_000).toISOString()
}

describe('formatReviewNextDue', () => {
  it('should say less than a minute for a card due now', () => {
    expect(formatReviewNextDue(at(1), now)).toBe('in less than a minute')
    expect(formatReviewNextDue(at(-5), now)).toBe('in less than a minute')
  })

  it('should count minutes under an hour', () => {
    expect(formatReviewNextDue(at(10), now)).toBe('in 10 minutes')
    expect(formatReviewNextDue(at(59), now)).toBe('in 59 minutes')
  })

  it('should count rounded hours under a day', () => {
    expect(formatReviewNextDue(at(60), now)).toBe('in 1 hour')
    expect(formatReviewNextDue(at(90), now)).toBe('in 2 hours')
    expect(formatReviewNextDue(at(5 * 60), now)).toBe('in 5 hours')
  })

  it('should not call a card due in 23h40m tomorrow', () => {
    expect(formatReviewNextDue(at(23 * 60 + 40), now)).toBe('in 24 hours')
  })

  it('should say tomorrow for a card due a day or so away', () => {
    expect(formatReviewNextDue(at(24 * 60), now)).toBe('tomorrow')
    expect(formatReviewNextDue(at(30 * 60), now)).toBe('tomorrow')
  })

  it('should show a weekday date for a card due later', () => {
    const due = at(5 * 24 * 60)

    expect(formatReviewNextDue(due, now)).toBe(
      new Date(due).toLocaleDateString(undefined, { weekday: 'long', month: 'short', day: 'numeric' }),
    )
  })
})
