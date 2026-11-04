import { describe, expect, it } from 'vitest'

import { listTruncation, truncationAfterRemoval } from './list-truncation'

describe('listTruncation', () => {
  it('should report shown and total only when the server says the list is cut off', () => {
    expect(listTruncation({ items: [1, 2], hasMore: true, total: 5 })).toEqual({ shown: 2, total: 5 })
    expect(listTruncation({ items: [1, 2], hasMore: false, total: 2 })).toBeNull()
  })

  it('should stay silent for an older server that sends no truncation fields', () => {
    expect(listTruncation({ items: [1, 2] })).toBeNull()
  })

  it('should lower both counts when cards leave and drop the notice once nothing is hidden', () => {
    expect(truncationAfterRemoval({ shown: 200, total: 230 }, 2)).toEqual({ shown: 198, total: 228 })
    expect(truncationAfterRemoval({ shown: 5, total: 5 }, 0)).toBeNull()
    expect(truncationAfterRemoval(null, 1)).toBeNull()
  })
})
