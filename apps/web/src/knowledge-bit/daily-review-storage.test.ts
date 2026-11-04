// @vitest-environment jsdom
import { afterEach, beforeEach, describe, it, expect, vi } from 'vitest'

import { getDailyReviewCount, incrementDailyReviewCount } from './daily-review-storage'

function localKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

describe('getDailyReviewCount', () => {
  beforeEach(() => localStorage.clear())
  afterEach(() => localStorage.clear())

  it('should return 0 when no localStorage entry exists', () => {
    expect(getDailyReviewCount()).toBe(0)
  })

  it('should return 0 when the stored value is not a number', () => {
    localStorage.setItem(`review-count-${localKey(new Date())}`, 'bad')
    expect(getDailyReviewCount()).toBe(0)
  })
})

describe('incrementDailyReviewCount', () => {
  beforeEach(() => localStorage.clear())
  afterEach(() => localStorage.clear())

  it('should increment count from 0 to 1 on first call', () => {
    incrementDailyReviewCount()
    expect(getDailyReviewCount()).toBe(1)
  })

  it('should increment correctly on repeated calls', () => {
    incrementDailyReviewCount()
    incrementDailyReviewCount()
    incrementDailyReviewCount()
    expect(getDailyReviewCount()).toBe(3)
  })

  it('should use a different key on a new date and return 0 for that day', () => {
    const yesterdayKey = `review-count-2000-01-01`

    localStorage.setItem(yesterdayKey, '5')
    expect(getDailyReviewCount()).toBe(0)
  })
})

describe('local midnight', () => {
  beforeEach(() => localStorage.clear())
  afterEach(() => {
    vi.useRealTimers()
    localStorage.clear()
  })

  it('should keep counting on the same local day at 23:30 and start a new day at 00:30', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date(2026, 5, 10, 23, 30))
    incrementDailyReviewCount()
    incrementDailyReviewCount()
    expect(getDailyReviewCount()).toBe(2)
    expect(localStorage.getItem('review-count-2026-06-10')).toBe('2')

    vi.setSystemTime(new Date(2026, 5, 11, 0, 30))
    expect(getDailyReviewCount()).toBe(0)
    incrementDailyReviewCount()
    expect(localStorage.getItem('review-count-2026-06-11')).toBe('1')
  })
})
