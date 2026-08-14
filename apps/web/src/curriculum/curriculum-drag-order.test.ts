import { describe, it, expect } from 'vitest'
import { reorderAfterDrag } from './curriculum-drag-order'

describe('reorderAfterDrag', () => {
  it('moves active item to over item position', () => {
    const result = reorderAfterDrag(['a', 'b', 'c'], 'b', 'a')
    expect(result).toEqual(['b', 'a', 'c'])
  })

  it('handles move to end', () => {
    const result = reorderAfterDrag(['a', 'b', 'c'], 'a', 'c')
    expect(result).toEqual(['b', 'c', 'a'])
  })

  it('handles move from end to start', () => {
    const result = reorderAfterDrag(['a', 'b', 'c'], 'c', 'a')
    expect(result).toEqual(['c', 'a', 'b'])
  })

  it('returns unchanged when active equals over', () => {
    const result = reorderAfterDrag(['a', 'b', 'c'], 'b', 'b')
    expect(result).toEqual(['a', 'b', 'c'])
  })

  it('returns unchanged when active not in list', () => {
    const result = reorderAfterDrag(['a', 'b', 'c'], 'x', 'a')
    expect(result).toEqual(['a', 'b', 'c'])
  })

  it('returns unchanged when over not in list', () => {
    const result = reorderAfterDrag(['a', 'b', 'c'], 'a', 'x')
    expect(result).toEqual(['a', 'b', 'c'])
  })

  it('handles single item', () => {
    const result = reorderAfterDrag(['a'], 'a', 'a')
    expect(result).toEqual(['a'])
  })

  it('returns empty list when given empty list', () => {
    const result = reorderAfterDrag([], 'a', 'b')
    expect(result).toEqual([])
  })

  it('handles two items swap', () => {
    const result = reorderAfterDrag(['a', 'b'], 'a', 'b')
    expect(result).toEqual(['b', 'a'])
  })
})
