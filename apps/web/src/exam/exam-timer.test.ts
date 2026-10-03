import { describe, expect, it } from 'vitest'

import { examDurationSeconds, examSecondsRemaining, formatRemaining } from './exam-timer'

describe('examDurationSeconds', () => {
  it('allots 60 seconds per question', () => {
    expect(examDurationSeconds(10)).toBe(600)
    expect(examDurationSeconds(30)).toBe(1800)
  })
})

describe('examSecondsRemaining', () => {
  it('counts down from the full duration right after creation', () => {
    const createdAt = '2026-10-03T00:00:00.000Z'
    const now = new Date(createdAt).getTime()

    expect(examSecondsRemaining(createdAt, 10, now)).toBe(600)
  })

  it('decreases as elapsed time passes', () => {
    const createdAt = '2026-10-03T00:00:00.000Z'
    const now = new Date(createdAt).getTime() + 100_000

    expect(examSecondsRemaining(createdAt, 10, now)).toBe(500)
  })

  it('clamps to exactly zero at the duration boundary, never negative', () => {
    const createdAt = '2026-10-03T00:00:00.000Z'
    const atLimit = new Date(createdAt).getTime() + 600_000
    const pastLimit = new Date(createdAt).getTime() + 700_000

    expect(examSecondsRemaining(createdAt, 10, atLimit)).toBe(0)
    expect(examSecondsRemaining(createdAt, 10, pastLimit)).toBe(0)
  })

  it('never reports a negative remaining time, even if "now" precedes createdAt', () => {
    const createdAt = '2026-10-03T00:00:10.000Z'
    const nowBeforeCreatedAt = new Date(createdAt).getTime() - 5_000

    expect(examSecondsRemaining(createdAt, 10, nowBeforeCreatedAt)).toBeGreaterThanOrEqual(0)
  })
})

describe('formatRemaining', () => {
  it('formats minutes and seconds, zero-padding seconds under 10', () => {
    expect(formatRemaining(605)).toBe('10:05')
    expect(formatRemaining(60)).toBe('1:00')
    expect(formatRemaining(0)).toBe('0:00')
  })
})
