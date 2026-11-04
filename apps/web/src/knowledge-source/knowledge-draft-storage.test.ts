// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'

import {
  KNOWLEDGE_DRAFT_MAX_CHARS,
  KNOWLEDGE_DRAFT_STORAGE_KEY,
  readKnowledgeDraft,
  writeKnowledgeDraft,
} from './knowledge-draft-storage'

afterEach(() => {
  window.localStorage.clear()
  vi.restoreAllMocks()
})

describe('knowledge draft storage', () => {
  it('should give back the blocks that were typed, without transient flags', () => {
    writeKnowledgeDraft([
      { type: 'text', value: 'notes', force: true },
      { type: 'url', value: 'https://a.b' },
    ])

    expect(readKnowledgeDraft()).toEqual([
      { type: 'text', value: 'notes' },
      { type: 'url', value: 'https://a.b' },
    ])
  })

  it('should forget the draft once every block is empty', () => {
    writeKnowledgeDraft([{ type: 'text', value: 'notes' }])
    writeKnowledgeDraft([{ type: 'text', value: '' }])

    expect(window.localStorage.getItem(KNOWLEDGE_DRAFT_STORAGE_KEY)).toBeNull()
  })

  it('should not keep a draft that is too large to store safely', () => {
    writeKnowledgeDraft([{ type: 'text', value: 'x'.repeat(KNOWLEDGE_DRAFT_MAX_CHARS + 1) }])

    expect(readKnowledgeDraft()).toBeNull()
  })

  it('should ignore a corrupted draft and survive unavailable storage', () => {
    window.localStorage.setItem(KNOWLEDGE_DRAFT_STORAGE_KEY, '{nope')
    expect(readKnowledgeDraft()).toBeNull()

    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('full')
    })

    expect(() => writeKnowledgeDraft([{ type: 'text', value: 'a' }])).not.toThrow()
  })
})
