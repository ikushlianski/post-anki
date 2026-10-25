import { describe, expect, it } from 'vitest'
import type { PendingKnowledgeSourceForReview } from '@post-anki/shared'

import { resolveDoneNote, resolveFailedNote } from './added-note-progress'
import type { AddedNote } from './added-note-progress'

const note: AddedNote = { sourceId: 'ks_1', label: 'Closures in JS', phase: 'working' }

function group(bits: { id: string; reviewFlag?: string | null }[], attention?: PendingKnowledgeSourceForReview['attention']) {
  return {
    knowledgeSourceId: 'ks_1',
    sourceText: null,
    subjectName: null,
    bits: bits.map((bit) => ({
      id: bit.id,
      body: 'b',
      background: null,
      variants: [],
      origin: 'extracted' as const,
      isAiGenerated: true,
      sourceLinks: [],
      reviewFlag: bit.reviewFlag ?? null,
    })),
    attention,
  } satisfies PendingKnowledgeSourceForReview
}

describe('resolveDoneNote', () => {
  it('reports the number of cards waiting in triage and how many need a manual check', () => {
    const result = resolveDoneNote(note, [group([{ id: 'a' }, { id: 'b', reviewFlag: 'bad_card' }, { id: 'c' }])])

    expect(result).toMatchObject({ phase: 'ready', cardCount: 3, flaggedCount: 1 })
  })

  it('asks for attention with the plain empty-result reason when a finished note has no cards', () => {
    const result = resolveDoneNote(note, [])

    expect(result.phase).toBe('attention')
    expect(result.reason).toBe('The AI finished but found nothing to turn into a card.')
  })

  it('uses the stuck wording when triage reports the note as stuck', () => {
    const attention = {
      knowledgeSourceId: 'ks_1',
      kind: 'stuck' as const,
      reason: null,
      firstWords: 'x',
      sourceText: null,
      since: '2026-01-01',
    }

    expect(resolveDoneNote(note, [group([], attention)]).reason).toBe('Still working after more than 20 minutes.')
  })
})

describe('resolveFailedNote', () => {
  it('shows a plain reason instead of the stored failure code', () => {
    const result = resolveFailedNote(note, { status: 'failed', failureReason: 'no_valid_items' })

    expect(result.phase).toBe('attention')
    expect(result.reason).toBe('The AI could not produce a usable card from this note.')
  })

  it('falls back to the generic wording for unknown failure text', () => {
    const result = resolveFailedNote(note, { status: 'failed', failureReason: 'TypeError: boom at x.js:1' })

    expect(result.reason).not.toContain('TypeError')
  })
})
