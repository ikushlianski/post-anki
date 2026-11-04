import { describe, expect, it } from 'vitest'

import { computeUndecidedCount } from './pending-undecided-count'

const page = new Set(Array.from({ length: 200 }, (_, index) => `bit_${index}`))

describe('computeUndecidedCount', () => {
  it('should show the server total of 250 when only a 200-card page is loaded', () => {
    expect(
      computeUndecidedCount({ total: 250, loadedBitIds: page, resolvedBitIds: [], localCount: 200 }),
    ).toBe(250)
  })

  it('should drop to 249 after one card from the loaded page is decided', () => {
    expect(
      computeUndecidedCount({
        total: 250,
        loadedBitIds: page,
        resolvedBitIds: ['bit_3'],
        localCount: 199,
      }),
    ).toBe(249)
  })

  it('should count inboxed and chatted cards as handled the same way as decisions', () => {
    expect(
      computeUndecidedCount({
        total: 250,
        loadedBitIds: page,
        resolvedBitIds: ['bit_1', 'bit_2', 'bit_3'],
        localCount: 197,
      }),
    ).toBe(247)
  })

  it('should fall back to the local count when the server sent no total', () => {
    expect(
      computeUndecidedCount({
        total: undefined,
        loadedBitIds: page,
        resolvedBitIds: ['bit_1'],
        localCount: 199,
      }),
    ).toBe(199)
  })

  it('should subtract a card present in two resolved sets only once', () => {
    expect(
      computeUndecidedCount({
        total: 250,
        loadedBitIds: page,
        resolvedBitIds: ['bit_5', 'bit_5'],
        localCount: 199,
      }),
    ).toBe(249)
  })

  it('should not subtract resolved cards that were never in the loaded page', () => {
    expect(
      computeUndecidedCount({
        total: 250,
        loadedBitIds: page,
        resolvedBitIds: ['late_bit'],
        localCount: 201,
      }),
    ).toBe(250)
  })
})
