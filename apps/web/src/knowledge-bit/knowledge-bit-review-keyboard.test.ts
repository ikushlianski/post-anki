// @vitest-environment jsdom
import { describe, expect, it } from 'vitest'

import { isTypingTarget, resolveReviewKey, variantIndexOf } from './knowledge-bit-review-keyboard'

function press(key: string, overrides: Partial<Parameters<typeof resolveReviewKey>[0]> = {}) {
  return resolveReviewKey({
    key,
    shiftKey: key !== key.toLowerCase(),
    ctrlKey: false,
    metaKey: false,
    altKey: false,
    target: null,
    ...overrides,
  })
}

describe('resolveReviewKey', () => {
  it('should map a to approve and r to reject', () => {
    expect(press('a')).toBe('approve')
    expect(press('r')).toBe('reject')
  })

  it('should move between suggestions with the left and right arrows and ignore j and k', () => {
    expect(press('ArrowRight')).toBe('next')
    expect(press('ArrowLeft')).toBe('previous')
    expect(press('j')).toBeNull()
    expect(press('k')).toBeNull()
  })

  it('should treat numpad 4 and 6 as left and right even with NumLock on', () => {
    expect(press('6', { code: 'Numpad6' })).toBe('next')
    expect(press('4', { code: 'Numpad4' })).toBe('previous')
    expect(press('6', { code: 'Digit6' })).toBe('variant-6')
  })

  it('should map z to undoing the last decision', () => {
    expect(press('z')).toBe('undo')
    expect(press('Z')).toBe('undo')
    expect(press('z', { ctrlKey: true })).toBeNull()
  })

  it('should map Shift+A to approving everything from the focused source', () => {
    expect(press('A')).toBe('approve-source')
  })

  it('should not fire while the reviewer is typing in an input or textarea', () => {
    const input = document.createElement('input')
    const textarea = document.createElement('textarea')

    expect(press('a', { target: input })).toBeNull()
    expect(press('r', { target: textarea })).toBeNull()
    expect(isTypingTarget(input)).toBe(true)
  })

  it('should leave browser shortcuts such as Cmd+R alone', () => {
    expect(press('r', { metaKey: true })).toBeNull()
    expect(press('a', { ctrlKey: true })).toBeNull()
  })

  it('should map number keys to toggling that card and Return to keeping the selection', () => {
    expect(press('1')).toBe('variant-1')
    expect(press('9')).toBe('variant-9')
    expect(variantIndexOf('variant-3')).toBe(2)
    expect(variantIndexOf('next')).toBeNull()
    expect(press('Enter')).toBe('keep')
    expect(press('x')).toBe('reject')
  })

  it('should let Return press a focused button instead of keeping the piece', () => {
    expect(press('Enter', { target: document.createElement('button') })).toBeNull()
  })

  it('should not treat Cmd+number as a card toggle', () => {
    expect(press('1', { metaKey: true })).toBeNull()
  })

  it('should ignore keys that are not shortcuts', () => {
    expect(press('q')).toBeNull()
  })
})
