import { describe, expect, it } from 'vitest'
import type { PendingKnowledgeBitDuplicateOf } from '@post-anki/shared'

import { similarCardIds } from './duplicate-similar-cards'

describe('similarCardIds', () => {
  it('should still list the main similar card when an older server sends no similarBitIds', () => {
    const legacy = { bitId: 'b1', front: 'f', back: 'b', similarity: 0.9 } as PendingKnowledgeBitDuplicateOf

    expect(similarCardIds(legacy)).toEqual(['b1'])
  })

  it('should not list the same card twice', () => {
    const dup = { bitId: 'b1', front: 'f', back: 'b', similarity: 0.9, reason: null, similarBitIds: ['b1', 'b2'] }

    expect(similarCardIds(dup)).toEqual(['b1', 'b2'])
  })
})
