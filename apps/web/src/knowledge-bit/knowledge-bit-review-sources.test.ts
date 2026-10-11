import { describe, expect, it } from 'vitest'
import type { PendingKnowledgeBitForReview, PendingKnowledgeSourceForReview } from '@post-anki/shared'

import { removeBit, restoreBit, snapshotBit } from './knowledge-bit-review-sources'

function bit(id: string): PendingKnowledgeBitForReview {
  return { id, body: `body ${id}`, background: null, variants: [] }
}

function source(id: string, bitIds: string[]): PendingKnowledgeSourceForReview {
  return { knowledgeSourceId: id, sourceText: `text ${id}`, bits: bitIds.map(bit) }
}

describe('snapshotBit and restoreBit', () => {
  it('should remember where a suggestion was so undo puts it back in the same spot', () => {
    const before = [source('s1', ['a', 'b', 'c'])]
    const snapshot = snapshotBit(before, 'b')!
    const after = restoreBit(removeBit(before, 'b'), snapshot)

    expect(after[0]!.bits.map((candidate) => candidate.id)).toEqual(['a', 'b', 'c'])
  })

  it('should bring back a whole source group when its only suggestion was rejected', () => {
    const before = [source('s1', ['a']), source('s2', ['x'])]
    const snapshot = snapshotBit(before, 'a')!
    const after = restoreBit(removeBit(before, 'a'), snapshot)

    expect(after.map((group) => group.knowledgeSourceId)).toEqual(['s1', 's2'])
    expect(after[0]!.sourceText).toBe('text s1')
  })

  it('should not add the suggestion twice when it is already listed', () => {
    const sources = [source('s1', ['a', 'b'])]
    const snapshot = snapshotBit(sources, 'a')!

    expect(restoreBit(sources, snapshot)[0]!.bits).toHaveLength(2)
  })

  it('should append at the end when the group got shorter in the meantime', () => {
    const before = [source('s1', ['a', 'b', 'c'])]
    const snapshot = snapshotBit(before, 'c')!
    const shorter = [source('s1', ['a'])]

    expect(restoreBit(shorter, snapshot)[0]!.bits.map((candidate) => candidate.id)).toEqual(['a', 'c'])
  })

  it('should return nothing for a suggestion that is not on screen', () => {
    expect(snapshotBit([source('s1', ['a'])], 'missing')).toBeNull()
  })
})
