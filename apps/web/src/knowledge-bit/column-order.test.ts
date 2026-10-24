import { describe, expect, it } from 'vitest'

import { applyColumnOrder, moveColumn } from './column-order'

const defaults = ['phrasings', 'addedBy', 'addedAt', 'answer']

describe('applyColumnOrder', () => {
  it('should use the default order when nothing was saved', () => {
    expect(applyColumnOrder(null, defaults)).toEqual(defaults)
  })

  it('should keep the saved order of columns that still exist', () => {
    expect(applyColumnOrder(['answer', 'phrasings', 'addedBy', 'addedAt'], defaults)).toEqual([
      'answer',
      'phrasings',
      'addedBy',
      'addedAt',
    ])
  })

  it('should drop a saved column that no longer exists', () => {
    expect(applyColumnOrder(['gone', 'answer'], defaults)).toEqual([
      'answer',
      'phrasings',
      'addedBy',
      'addedAt',
    ])
  })

  it('should put a newly added column at the end', () => {
    expect(applyColumnOrder(['addedAt', 'answer'], defaults)).toEqual([
      'addedAt',
      'answer',
      'phrasings',
      'addedBy',
    ])
  })
})

describe('moveColumn', () => {
  it('should move a dragged column to the place of the one it was dropped on', () => {
    expect(moveColumn(defaults, 'answer', 'phrasings')).toEqual([
      'answer',
      'phrasings',
      'addedBy',
      'addedAt',
    ])
  })

  it('should leave the order alone when dropped on itself or an unknown column', () => {
    expect(moveColumn(defaults, 'answer', 'answer')).toEqual(defaults)
    expect(moveColumn(defaults, 'answer', 'nope')).toEqual(defaults)
  })
})
