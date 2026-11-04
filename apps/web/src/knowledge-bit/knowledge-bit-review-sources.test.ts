import { describe, expect, it } from 'vitest'
import type { PendingKnowledgeSourceForReview } from '@post-anki/shared'

import { applyBitEdit, applyBitExample } from './knowledge-bit-review-sources'

const SOURCES: PendingKnowledgeSourceForReview[] = [
  {
    knowledgeSourceId: 's1',
    sourceText: null,
    subjectName: null,
    bits: [
      {
        id: 'b1',
        body: 'Fact',
        background: 'AI text',
        exampleAiGeneratedAt: '2026-10-28T10:00:00.000Z',
        origin: 'extracted',
        isAiGenerated: false,
        sourceLinks: [],
        variants: [],
      },
    ],
  },
]

describe('applyBitExample', () => {
  it('should store the example and the AI marker on the item', () => {
    const [source] = applyBitExample(SOURCES, 'b1', 'New', '2026-10-28T11:00:00.000Z')

    expect(source!.bits[0]).toMatchObject({ background: 'New', exampleAiGeneratedAt: '2026-10-28T11:00:00.000Z' })
  })
})

describe('applyBitEdit', () => {
  it('should drop the AI marker when the learner changes the example text', () => {
    const [source] = applyBitEdit(SOURCES, 'b1', 'Fact', 'My text')

    expect(source!.bits[0]!.exampleAiGeneratedAt).toBeNull()
  })

  it('should keep the AI marker when only the body changes', () => {
    const [source] = applyBitEdit(SOURCES, 'b1', 'Fact edited', 'AI text')

    expect(source!.bits[0]!.exampleAiGeneratedAt).toBe('2026-10-28T10:00:00.000Z')
  })
})
