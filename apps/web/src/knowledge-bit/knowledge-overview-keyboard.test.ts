// @vitest-environment jsdom
import { describe, expect, it } from 'vitest'

import { resolveFocusedRowId, resolveOverviewKey } from './knowledge-overview-keyboard'
import type { OverviewKeyEvent } from './knowledge-overview-keyboard'

function press(key: string, overrides: Partial<OverviewKeyEvent> = {}) {
  return resolveOverviewKey({
    key,
    shiftKey: false,
    ctrlKey: false,
    metaKey: false,
    altKey: false,
    repeat: false,
    target: null,
    ...overrides,
  })
}

describe('resolveOverviewKey', () => {
  it('should move row focus with arrows, Home and End', () => {
    expect(press('ArrowDown')).toEqual({ type: 'focus', to: 'next', extend: false })
    expect(press('ArrowUp')).toEqual({ type: 'focus', to: 'previous', extend: false })
    expect(press('Home')).toEqual({ type: 'focus', to: 'first', extend: false })
    expect(press('End')).toEqual({ type: 'focus', to: 'last', extend: false })
  })

  it('should extend the selection when Shift is held with an arrow', () => {
    expect(press('ArrowDown', { shiftKey: true })).toEqual({ type: 'focus', to: 'next', extend: true })
  })

  it('should toggle on Space and clear on Escape', () => {
    expect(press(' ')).toEqual({ type: 'toggle' })
    expect(press('Escape')).toEqual({ type: 'clear' })
  })

  it('should select all loaded rows on Ctrl+A and Cmd+A', () => {
    expect(press('a', { ctrlKey: true })).toEqual({ type: 'select-all' })
    expect(press('a', { metaKey: true })).toEqual({ type: 'select-all' })
  })

  it('should select all on a Russian layout where the key is Cyrillic but the physical key is A', () => {
    expect(press('ф', { ctrlKey: true, code: 'KeyA' })).toEqual({ type: 'select-all' })
    expect(press('ф', { metaKey: true, code: 'KeyA' })).toEqual({ type: 'select-all' })
  })

  it('should not select all for a Cyrillic key on a different physical key', () => {
    expect(press('ф', { ctrlKey: true, code: 'KeyB' })).toBeNull()
  })

  it('should leave Ctrl+A to the text field when typing on a Russian layout', () => {
    expect(press('ф', { ctrlKey: true, code: 'KeyA', target: document.createElement('input') })).toBeNull()
    expect(press('ф', { metaKey: true, code: 'KeyA', target: document.createElement('textarea') })).toBeNull()
  })

  it('should open delete on Delete and Backspace', () => {
    expect(press('Delete')).toEqual({ type: 'delete' })
    expect(press('Backspace')).toEqual({ type: 'delete' })
  })

  it('should ignore held-down keys for destructive or toggling actions', () => {
    expect(press('Delete', { repeat: true })).toBeNull()
    expect(press(' ', { repeat: true })).toBeNull()
    expect(press('ArrowDown', { repeat: true })).not.toBeNull()
  })

  it('should ignore keys typed into the filter or search fields', () => {
    const input = document.createElement('input')

    expect(press('Backspace', { target: input })).toBeNull()
    expect(press('a', { ctrlKey: true, target: input })).toBeNull()
    expect(press('ArrowDown', { target: input })).toBeNull()
  })

  it('should leave buttons to their own Space and Enter handling', () => {
    expect(press(' ', { target: document.createElement('button') })).toBeNull()
  })

  it('should open move on M key', () => {
    expect(press('m')).toEqual({ type: 'move' })
    expect(press('M')).toEqual({ type: 'move' })
  })

  it('should ignore unrelated keys', () => {
    expect(press('x', { ctrlKey: true })).toBeNull()
  })
})

describe('resolveFocusedRowId', () => {
  const order = ['a', 'b', 'c']

  it('should clamp at both ends of the list', () => {
    expect(resolveFocusedRowId(order, 'c', 'next')).toBe('c')
    expect(resolveFocusedRowId(order, 'a', 'previous')).toBe('a')
  })

  it('should jump to the first and last rows', () => {
    expect(resolveFocusedRowId(order, 'b', 'first')).toBe('a')
    expect(resolveFocusedRowId(order, 'b', 'last')).toBe('c')
  })

  it('should start from the first row when nothing has focus yet', () => {
    expect(resolveFocusedRowId(order, null, 'next')).toBe('a')
  })

  it('should return null for an empty list', () => {
    expect(resolveFocusedRowId([], null, 'next')).toBeNull()
  })
})
