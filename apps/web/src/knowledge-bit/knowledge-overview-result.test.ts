import { describe, expect, it } from 'vitest'

import { describeOverviewDeleteResult, describeOverviewSelection } from './knowledge-overview-result'

describe('describeOverviewDeleteResult', () => {
  it('should state how many cards were deleted', () => {
    expect(describeOverviewDeleteResult({ deleted: ['a', 'b', 'c'], skipped: [] })).toBe('Deleted 3 cards.')
    expect(describeOverviewDeleteResult({ deleted: ['a'], skipped: [] })).toBe('Deleted 1 card.')
  })

  it('should say how many were already gone or kept because they are not approved', () => {
    expect(
      describeOverviewDeleteResult({
        deleted: ['a', 'b', 'c'],
        skipped: [
          { id: 'd', reason: 'not_found' },
          { id: 'e', reason: 'not_approved' },
        ],
      }),
    ).toBe('Deleted 3 cards. 1 already gone. 1 not approved, so kept.')
  })
})

describe('describeOverviewSelection', () => {
  it('should announce the count, the empty state and the cap', () => {
    expect(describeOverviewSelection(3, false)).toBe('3 selected')
    expect(describeOverviewSelection(0, false)).toBe('No cards selected')
    expect(describeOverviewSelection(200, true)).toContain('limited to 200')
  })
})
