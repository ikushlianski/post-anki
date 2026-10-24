import { describe, expect, it } from 'vitest'

import {
  OVERVIEW_SELECTION_CAP,
  clearSelection,
  emptySelection,
  extendTo,
  pickFocusAfterRemoval,
  pruneSelection,
  selectAllLoaded,
  setCursor,
  toggleRow,
} from './knowledge-overview-selection'

const ids = (count: number) => Array.from({ length: count }, (_, index) => `bit-${index + 1}`)

describe('overview selection', () => {
  it('should select the rows between the anchor and the cursor when extending with Shift', () => {
    const order = ids(6)
    const start = toggleRow(setCursor(emptySelection(), 'bit-2'), 'bit-2').selection
    const { selection } = extendTo(start, order, 'bit-4')

    expect([...selection.selected]).toEqual(['bit-2', 'bit-3', 'bit-4'])
  })

  it('should shrink the range when Shift extends back toward the anchor', () => {
    const order = ids(6)
    const start = toggleRow(emptySelection(), 'bit-2').selection
    const extended = extendTo(start, order, 'bit-5').selection
    const { selection } = extendTo(extended, order, 'bit-3')

    expect([...selection.selected].sort()).toEqual(['bit-2', 'bit-3'])
  })

  it('should keep earlier picks outside the range when extending', () => {
    const order = ids(8)
    const first = toggleRow(emptySelection(), 'bit-1').selection
    const second = toggleRow(first, 'bit-5').selection
    const { selection } = extendTo(second, order, 'bit-7')

    expect([...selection.selected].sort()).toEqual(['bit-1', 'bit-5', 'bit-6', 'bit-7'])
  })

  it('should stop at 200 cards and report that the selection was capped', () => {
    const order = ids(250)
    const { selection, capped } = selectAllLoaded(emptySelection(), order)

    expect(selection.selected.size).toBe(OVERVIEW_SELECTION_CAP)
    expect(capped).toBe(true)
  })

  it('should not report a cap when everything loaded fits', () => {
    const { selection, capped } = selectAllLoaded(emptySelection(), ids(30))

    expect(selection.selected.size).toBe(30)
    expect(capped).toBe(false)
  })

  it('should refuse a 201st pick by toggling', () => {
    const full = selectAllLoaded(emptySelection(), ids(250)).selection
    const { selection, capped } = toggleRow(full, 'bit-250')

    expect(selection.selected.size).toBe(OVERVIEW_SELECTION_CAP)
    expect(selection.selected.has('bit-250')).toBe(false)
    expect(capped).toBe(true)
  })

  it('should drop selected rows that disappeared from the loaded data', () => {
    const picked = extendTo(toggleRow(emptySelection(), 'bit-1').selection, ids(4), 'bit-3').selection
    const pruned = pruneSelection(picked, ['bit-1', 'bit-3', 'bit-4'])

    expect([...pruned.selected].sort()).toEqual(['bit-1', 'bit-3'])
  })

  it('should keep the same selection object when nothing changed in the data', () => {
    const picked = toggleRow(emptySelection(), 'bit-1').selection

    expect(pruneSelection(picked, ids(3))).toBe(picked)
  })

  it('should keep the cursor but forget the picks when cleared', () => {
    const picked = toggleRow(emptySelection(), 'bit-2').selection
    const cleared = clearSelection(picked)

    expect(cleared.selected.size).toBe(0)
    expect(cleared.cursor).toBe('bit-2')
  })
})

describe('pickFocusAfterRemoval', () => {
  const order = ['a', 'b', 'c', 'd']

  it('should focus the next surviving row after the cursor', () => {
    expect(pickFocusAfterRemoval(order, new Set(['b', 'c']), 'b')).toBe('d')
  })

  it('should fall back to the previous surviving row when none follow', () => {
    expect(pickFocusAfterRemoval(order, new Set(['c', 'd']), 'd')).toBe('b')
  })

  it('should return null when no row survives so the heading can take focus', () => {
    expect(pickFocusAfterRemoval(order, new Set(order), 'a')).toBeNull()
  })

  it('should keep focus on the cursor row when it was not removed', () => {
    expect(pickFocusAfterRemoval(order, new Set(['a']), 'c')).toBe('c')
  })
})
