import { describe, expect, it } from 'vitest'
import type { PendingKnowledgeSourceForReview } from '@post-anki/shared'

import { resolveDoneNote, resolveFailedNote, resolveFinishedNote } from './added-note-progress'
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

  it('reports a nothing-extracted note with the plain wording and its kind so it is not styled as an error', () => {
    const attention = {
      knowledgeSourceId: 'ks_1',
      kind: 'nothing_extracted' as const,
      reason: null,
      firstWords: 'x',
      sourceText: null,
      since: '2026-01-01',
    }
    const result = resolveDoneNote(note, [group([], attention)])

    expect(result).toMatchObject({
      phase: 'attention',
      attentionKind: 'nothing_extracted',
      reason: 'Nothing here looked worth turning into a card.',
    })
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

describe('resolveFinishedNote', () => {
  it('shows the neutral nothing-extracted result from the status even when triage lists no attention entry', () => {
    const result = resolveFinishedNote(note, { status: 'nothing_extracted', failureReason: null, outcome: 'nothing', cardCount: 0 }, [])

    expect(result).toMatchObject({ phase: 'attention', attentionKind: 'nothing_extracted' })
  })

  it('treats a nothing_extracted status from an older server without outcome as nothing extracted', () => {
    const result = resolveFinishedNote(note, { status: 'nothing_extracted', failureReason: null }, [])

    expect(result.attentionKind).toBe('nothing_extracted')
  })

  it('keeps reporting every created card after some were approved or rejected in triage', () => {
    const result = resolveFinishedNote(note, { status: 'done', failureReason: null, outcome: 'cards', cardCount: 5 }, [group([{ id: 'a' }])])

    expect(result).toMatchObject({ phase: 'ready', cardCount: 5 })
  })

  it('still reports the card count when triage has no pending cards left for the note', () => {
    const result = resolveFinishedNote(note, { status: 'done', failureReason: null, outcome: 'cards', cardCount: 2 }, [])

    expect(result).toMatchObject({ phase: 'ready', cardCount: 2, flaggedCount: 0 })
  })

  it('falls back to the pending triage cards when an older server sends no outcome', () => {
    const result = resolveFinishedNote(note, { status: 'done', failureReason: null }, [group([{ id: 'a' }, { id: 'b' }])])

    expect(result).toMatchObject({ phase: 'ready', cardCount: 2 })
  })
})
