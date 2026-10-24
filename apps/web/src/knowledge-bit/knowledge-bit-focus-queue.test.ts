import type {
  PendingKnowledgeBitForReview,
  PendingKnowledgeSourceForReview,
} from '@post-anki/shared'
import { describe, expect, it } from 'vitest'

import { buildFocusQueue } from './knowledge-bit-focus-queue'

function bit(id: string, ready: boolean): PendingKnowledgeBitForReview {
  return {
    id,
    body: `Statement ${id}`,
    background: null,
    origin: 'extracted',
    isAiGenerated: false,
    sourceLinks: [],
    variants: ready ? [{ id: `${id}-v`, kind: 'wh_question', prompt: 'Q?', answer: 'A.' }] : [],
  }
}

function source(id: string, bits: PendingKnowledgeBitForReview[]): PendingKnowledgeSourceForReview {
  return { knowledgeSourceId: id, sourceText: null, subjectName: 'Subject', bits }
}

describe('buildFocusQueue', () => {
  it('should show the first card that has questions, with its source', () => {
    const queue = buildFocusQueue([
      source('s1', [bit('b1', false), bit('b2', true)]),
      source('s2', [bit('b3', true)]),
    ])

    expect(queue.current?.bit.id).toBe('b2')
    expect(queue.current?.source.knowledgeSourceId).toBe('s1')
    expect(queue.readyCount).toBe(2)
    expect(queue.waitingCount).toBe(1)
  })

  it('should report cards still being written when none is ready', () => {
    const queue = buildFocusQueue([source('s1', [bit('b1', false), bit('b2', false)])])

    expect(queue.current).toBeNull()
    expect(queue.readyCount).toBe(0)
    expect(queue.waitingCount).toBe(2)
  })

  it('should report an empty queue when every card is decided', () => {
    expect(buildFocusQueue([])).toEqual({ current: null, readyCount: 0, waitingCount: 0 })
    expect(buildFocusQueue([source('s1', [])]).current).toBeNull()
  })
})
