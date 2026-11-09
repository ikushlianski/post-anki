import { describe, expect, it } from 'vitest'

import { HORIZONTAL_SWIPE_PX, resolveHorizontalSwipe } from './use-horizontal-swipe'

const origin = { x: 200, y: 100 }

describe('resolveHorizontalSwipe', () => {
  it('should accept a proposal only after a full swipe to the right', () => {
    expect(resolveHorizontalSwipe(origin, { x: 200 + HORIZONTAL_SWIPE_PX, y: 100 })).toBe('accept')
    expect(resolveHorizontalSwipe(origin, { x: 200 + HORIZONTAL_SWIPE_PX - 1, y: 100 })).toBeNull()
  })

  it('should reject a proposal only after a full swipe to the left', () => {
    expect(resolveHorizontalSwipe(origin, { x: 200 - HORIZONTAL_SWIPE_PX, y: 100 })).toBe('reject')
    expect(resolveHorizontalSwipe(origin, { x: 200 - HORIZONTAL_SWIPE_PX + 1, y: 100 })).toBeNull()
  })

  it('should ignore a mostly vertical drag so scrolling never decides a proposal', () => {
    expect(resolveHorizontalSwipe(origin, { x: 320, y: 260 })).toBeNull()
  })
})
