import { describe, expect, it } from 'vitest'

import {
  BROWSER_SELECTION_CAP,
  EMPTY_BROWSER_SELECTION,
  pruneBrowserSelection,
  selectBrowserRange,
  toggleAllBrowserRows,
  toggleBrowserRow,
} from './knowledge-browser-selection'

const ids = ['a', 'b', 'c', 'd', 'e']

describe('browser selection', () => {
  it('should add a piece on first click and remove it on second', () => {
    const on = toggleBrowserRow(EMPTY_BROWSER_SELECTION, 'b')

    expect([...on.selected]).toEqual(['b'])
    expect(toggleBrowserRow(on, 'b').selected.size).toBe(0)
  })

  it('should select everything between the last clicked piece and the shift-clicked one', () => {
    const start = toggleBrowserRow(EMPTY_BROWSER_SELECTION, 'b')

    expect([...selectBrowserRange(start, ids, 'd').selected]).toEqual(['b', 'c', 'd'])
    expect([...selectBrowserRange(toggleBrowserRow(EMPTY_BROWSER_SELECTION, 'd'), ids, 'b').selected].sort()).toEqual([
      'b',
      'c',
      'd',
    ])
  })

  it('should select all rows on the page, then clear them when all are already selected', () => {
    const all = toggleAllBrowserRows(EMPTY_BROWSER_SELECTION, ids)

    expect(all.selected.size).toBe(5)
    expect(toggleAllBrowserRows(all, ids).selected.size).toBe(0)
  })

  it('should never select more pieces than one delete request accepts', () => {
    const many = Array.from({ length: BROWSER_SELECTION_CAP + 20 }, (_, index) => `id${index}`)

    expect(toggleAllBrowserRows(EMPTY_BROWSER_SELECTION, many).selected.size).toBe(BROWSER_SELECTION_CAP)
  })

  it('should drop selected pieces that are no longer in the table', () => {
    const all = toggleAllBrowserRows(EMPTY_BROWSER_SELECTION, ids)

    expect([...pruneBrowserSelection(all, ['a', 'b']).selected]).toEqual(['a', 'b'])
  })
})
