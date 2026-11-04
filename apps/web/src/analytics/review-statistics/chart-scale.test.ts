import { describe, expect, it } from 'vitest'

import { bandX, formatPercent, linePath, scaleLinear } from './chart-scale'

describe('scaleLinear', () => {
  it('should map a zero-height series without dividing by zero', () => {
    expect(scaleLinear(0, 100)(0)).toBe(0)
  })

  it('should scale a value proportionally to the chart size', () => {
    expect(scaleLinear(10, 100)(5)).toBe(50)
  })
})

describe('linePath', () => {
  it('should leave a gap, not a drop to zero, where a day has no rate', () => {
    const path = linePath([
      { x: 0, y: 10 },
      { x: 10, y: null },
      { x: 20, y: 30 },
      { x: 30, y: 40 },
    ])

    expect(path).toBe('M0 10 M20 30 L30 40')
  })
})

describe('bandX', () => {
  it('should centre a single point', () => {
    expect(bandX(0, 1, 100)).toBe(50)
  })

  it('should spread points across the full width', () => {
    expect(bandX(2, 3, 100)).toBe(100)
  })
})

describe('formatPercent', () => {
  it('should show n/a rather than 0% when there is no rate', () => {
    expect(formatPercent(null)).toBe('n/a')
    expect(formatPercent(0.756)).toBe('76%')
  })
})
