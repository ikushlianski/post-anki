import { describe, expect, it } from 'vitest'
import type { PendingKnowledgeSourceForReview } from '@post-anki/shared'

import { applyNoteEdit, draftNote, noteEditTarget } from './knowledge-bit-review-note-edit'

const source = {
  knowledgeSourceId: 's1',
  bits: [
    {
      id: 'b1',
      body: 'old',
      variants: [{ id: 'v1', kind: 'cloze', prompt: 'p', answer: 'a', sentence: '{{c1::x}} y' }],
    },
    { id: 'b2', body: 'other', variants: [] },
  ],
} as unknown as PendingKnowledgeSourceForReview

describe('noteEditTarget', () => {
  it('should offer the whole note for a cloze bit and nothing for a plain card', () => {
    expect(
      noteEditTarget([{ id: 'v1', kind: 'cloze', prompt: 'p', answer: 'a', sentence: 'The {{c1::sky}} is blue' }]),
    ).toEqual({ mode: 'cloze', variantId: 'v1', text: 'The {{c1::sky}} is blue' })
    expect(noteEditTarget([{ id: 'v2', kind: 'basic', prompt: 'p', answer: 'a' }])).toBeNull()
  })

  it('should offer the list text for an ordered list bit', () => {
    expect(
      noteEditTarget([{ id: 'v3', kind: 'list_step', prompt: 'p', answer: 'a', sentence: 'T\na\nb\nc' }]),
    ).toEqual({ mode: 'list', variantId: 'v3', text: 'T\na\nb\nc' })
  })
})

describe('draftNote', () => {
  it('should reject a cloze note without gaps with the shared message', () => {
    expect(draftNote('cloze', 'No gaps here').problem).toBeTruthy()
  })

  it('should preview one card per gap number and derive the fact text', () => {
    const draft = draftNote('cloze', 'The {{c1::sky}} is {{c2::blue}}')

    expect(draft.problem).toBeNull()
    expect(draft.previews).toHaveLength(2)
    expect(draft.body).toBe('The sky is blue')
  })

  it('should reject a list with too few steps', () => {
    expect(draftNote('list', 'Title\none\ntwo').problem).toBeTruthy()
  })

  it('should accept a list of three steps', () => {
    const draft = draftNote('list', 'Title\n1. one\n2. two\n3. three')

    expect(draft.problem).toBeNull()
    expect(draft.sentence).toBe('Title\none\ntwo\nthree')
  })
})

describe('applyNoteEdit', () => {
  it('should replace the edited bit cards and body and leave other bits alone', () => {
    const draft = draftNote('cloze', 'A {{c1::b}} c')
    const next = applyNoteEdit([source], 'b1', 'cloze', draft, [{ id: 'n1', prompt: 'A ____ c', answer: 'b' }])

    expect(next[0]?.bits[0]?.body).toBe('A b c')
    expect(next[0]?.bits[0]?.variants).toEqual([
      { id: 'n1', kind: 'cloze', prompt: 'A ____ c', answer: 'b', sentence: 'A {{c1::b}} c' },
    ])
    expect(next[0]?.bits[1]).toBe(source.bits[1])
  })
})
