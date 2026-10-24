import { describe, expect, it } from 'vitest'

import {
  bestVariantId,
  keepIds,
  keepsEveryVariant,
  shownVariants,
  toggleVariant,
  variantLabel,
} from './knowledge-bit-triage-selection'

const mixed = [
  { id: 'q', kind: 'wh_question' as const },
  { id: 'f', kind: 'fill_in_the_blank' as const },
  { id: 'b', kind: 'basic' as const },
]

describe('triage selection', () => {
  it('should put the preferred variation first as the main card', () => {
    expect(bestVariantId(mixed)).toBe('b')
    expect(shownVariants(mixed).map((variant) => variant.id)).toEqual(['b', 'q', 'f'])
  })

  it('should approve every variation of the piece by default', () => {
    expect(keepIds(mixed, undefined)).toEqual(['b', 'q', 'f'])
    expect(keepsEveryVariant(mixed, undefined)).toBe(true)
  })

  it('should let a single variation be excluded and put it back', () => {
    const without = toggleVariant(mixed, undefined, 1)

    expect(without).toEqual(['b', 'f'])
    expect(keepsEveryVariant(mixed, without)).toBe(false)
    expect(toggleVariant(mixed, without, 1)).toEqual(['b', 'f', 'q'])
  })

  it('should never exclude the main card', () => {
    expect(toggleVariant(mixed, undefined, 0)).toEqual(['b', 'q', 'f'])
  })

  it('should keep more than two variations when a piece has many', () => {
    const many = Array.from({ length: 6 }, (_, i) => ({ id: `v${i}`, kind: 'basic' as const }))

    expect(keepIds(many, undefined)).toHaveLength(6)
  })

  it('should fall back to the main card when the selection matches nothing shown', () => {
    expect(keepIds(mixed, [])).toEqual(['b'])
  })

  it('should return kept ids in display order', () => {
    expect(keepIds(mixed, ['f', 'b'])).toEqual(['b', 'f'])
  })

  it('should ignore a number key beyond the shown cards', () => {
    expect(toggleVariant(mixed, ['b'], 7)).toEqual(['b'])
  })

  it('should label kinds in plain words and a repeated kind as Reworded', () => {
    const repeated = [
      { id: 'b', kind: 'basic' as const },
      { id: 'q', kind: 'wh_question' as const },
      { id: 'q2', kind: 'wh_question' as const },
    ]

    expect([0, 1, 2].map((i) => variantLabel(repeated, i))).toEqual(['Basic', 'Question', 'Reworded'])
  })
})
