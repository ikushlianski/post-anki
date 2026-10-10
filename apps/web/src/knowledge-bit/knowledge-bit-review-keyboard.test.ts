// @vitest-environment jsdom
import { describe, expect, it } from 'vitest'

import { isTypingTarget, resolveReviewKey } from './knowledge-bit-review-keyboard'

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
  it('should map a to approve, r to reject and j/k to moving between suggestions', () => {
    expect(press('a')).toBe('approve')
    expect(press('r')).toBe('reject')
    expect(press('j')).toBe('next')
    expect(press('k')).toBe('previous')
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

  it('should ignore keys that are not shortcuts', () => {
    expect(press('x')).toBeNull()
  })
})
