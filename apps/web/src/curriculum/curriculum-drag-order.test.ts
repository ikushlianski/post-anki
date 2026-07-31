import { describe, expect, it } from 'vitest'
import { reorderAfterDrag } from './curriculum-drag-order'

describe('reorderAfterDrag', () => {
  it('moves the active id to sit where the over id was, keeping everyone else in relative order', () => {
    const result = reorderAfterDrag(['a', 'b', 'c', 'd'], 'a', 'c')

    expect(result).toEqual(['b', 'c', 'a', 'd'])
  })

  it('moves an item backwards in the list', () => {
    const result = reorderAfterDrag(['a', 'b', 'c', 'd'], 'd', 'b')

    expect(result).toEqual(['a', 'd', 'b', 'c'])
  })

  it('returns the ids unchanged when active and over are the same id', () => {
    const ids = ['a', 'b', 'c']
    const result = reorderAfterDrag(ids, 'b', 'b')

    expect(result).toEqual(['a', 'b', 'c'])
  })

  it('returns the ids unchanged when the active id is not present', () => {
    const ids = ['a', 'b', 'c']
    const result = reorderAfterDrag(ids, 'missing', 'b')

    expect(result).toEqual(ids)
  })

  it('returns the ids unchanged when the over id is not present', () => {
    const ids = ['a', 'b', 'c']
    const result = reorderAfterDrag(ids, 'a', 'missing')

    expect(result).toEqual(ids)
  })

  it('is a no-op on a single-item list (drag has nothing to reorder against)', () => {
    const result = reorderAfterDrag(['only'], 'only', 'only')

    expect(result).toEqual(['only'])
  })

  it('returns an empty array unchanged', () => {
    const result = reorderAfterDrag([], 'a', 'b')

    expect(result).toEqual([])
  })
})
