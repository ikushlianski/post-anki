import { describe, expect, it } from 'vitest'

import {
  isDefaultLayout,
  reorderVisible,
  resolveColumnLayout,
  toggleColumn,
  visibleColumns,
} from './knowledge-browser-column-layout'

const defaults = ['a', 'b', 'c'] as const

describe('column layout', () => {
  it('should start with every column shown in the default order', () => {
    const layout = resolveColumnLayout(null, defaults)

    expect(layout).toEqual({ order: ['a', 'b', 'c'], hidden: [] })
    expect(isDefaultLayout(layout, defaults)).toBe(true)
  })

  it('should still load an order saved before columns could be hidden', () => {
    const layout = resolveColumnLayout({ order: ['c', 'a'], hidden: null }, defaults)

    expect(layout).toEqual({ order: ['c', 'a', 'b'], hidden: [] })
  })

  it('should ignore saved columns that no longer exist', () => {
    const layout = resolveColumnLayout({ order: ['zzz', 'b'], hidden: ['zzz', 'c'] }, defaults)

    expect(layout).toEqual({ order: ['b', 'a', 'c'], hidden: ['c'] })
  })

  it('should hide and show a column', () => {
    const hidden = toggleColumn(resolveColumnLayout(null, defaults), 'b')

    expect(visibleColumns(hidden)).toEqual(['a', 'c'])
    expect(visibleColumns(toggleColumn(hidden, 'b'))).toEqual(['a', 'b', 'c'])
  })

  it('should never hide the last visible column', () => {
    let layout = resolveColumnLayout(null, defaults)

    layout = toggleColumn(layout, 'a')
    layout = toggleColumn(layout, 'b')
    layout = toggleColumn(layout, 'c')

    expect(visibleColumns(layout)).toEqual(['c'])
  })

  it('should not reset a saved layout that hides everything into nothing visible', () => {
    expect(resolveColumnLayout({ order: null, hidden: ['a', 'b', 'c'] }, defaults).hidden).toEqual([])
  })

  it('should keep hidden columns in place when shown columns are reordered', () => {
    const layout = { order: ['a', 'b', 'c'], hidden: ['b'] }

    expect(reorderVisible(layout, ['c', 'a']).order).toEqual(['c', 'b', 'a'])
  })

  it('should tell a changed layout from the default', () => {
    expect(isDefaultLayout({ order: ['a', 'b', 'c'], hidden: ['a'] }, defaults)).toBe(false)
    expect(isDefaultLayout({ order: ['b', 'a', 'c'], hidden: [] }, defaults)).toBe(false)
  })
})
