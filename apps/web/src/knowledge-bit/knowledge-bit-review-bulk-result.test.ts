import { describe, expect, it } from 'vitest'

import { describeBulkApprovalResult } from './knowledge-bit-review-bulk-result'

describe('describeBulkApprovalResult', () => {
  it('should report only the approved count when nothing was skipped', () => {
    expect(describeBulkApprovalResult({ approved: ['a', 'b', 'c'], skipped: [] })).toBe(
      'Approved 3.',
    )
  })

  it('should explain skipped items by reason in plain words with a count per reason', () => {
    expect(
      describeBulkApprovalResult({
        approved: ['a'],
        skipped: [
          { id: 'b', reason: 'already_decided' },
          { id: 'c', reason: 'no_variant' },
        ],
      }),
    ).toBe('Approved 1. Skipped 2: 1 already decided, 1 has no questions yet.')
  })

  it('should group repeated reasons under one count and pluralise the wording', () => {
    expect(
      describeBulkApprovalResult({
        approved: [],
        skipped: [
          { id: 'b', reason: 'not_found' },
          { id: 'c', reason: 'not_found' },
          { id: 'd', reason: 'no_variant' },
        ],
      }),
    ).toBe('Approved 0. Skipped 3: 2 no longer exist, 1 has no questions yet.')
  })
})
