import { describe, expect, it } from 'vitest'
import type { ReviewCard } from '@post-anki/shared'

import {
  ankiReviewSessionReducer,
  applyEdit,
  initialAnkiReviewSession,
  withoutGradedThisSession,
  type AnkiReviewSessionAction,
  type SessionUndoEntry,
} from './anki-review-session'

const card = (bit: string, phase: ReviewCard['phase'] = 'review'): ReviewCard => ({
  variantId: `v-${bit}`,
  knowledgeBitId: bit,
  kind: 'wh_question',
  prompt: `prompt ${bit}`,
  answer: `answer ${bit}`,
  background: null,
  isAiGenerated: false,
  sourceLinks: [],
  phase,
  leech: false,
  intervalPreview: { again: 60, hard: 60, good: 60, easy: 60 },
})

const gradeEntry = (bit: string, phase: ReviewCard['phase'] = 'review'): SessionUndoEntry => ({
  kind: 'grade',
  reviewId: `r-${bit}`,
  card: card(bit, phase),
  grade: 'good',
  durationMs: 1000,
  leechSuspended: false,
  points: { awarded: 3, leveledUp: false, level: 1 },
  stamp: 1,
})

const run = (...actions: AnkiReviewSessionAction[]) =>
  actions.reduce(ankiReviewSessionReducer, initialAnkiReviewSession(0))

describe('ankiReviewSessionReducer', () => {
  it('should move to the next card, hidden, after a grade and remember it for undo', () => {
    const state = run({ type: 'reveal' }, { type: 'acted', entry: gradeEntry('a'), now: 10 })

    expect(state).toMatchObject({ index: 1, revealed: false, shownAt: 10 })
    expect(state.undo).toHaveLength(1)
  })

  it('should bring an undone card back to the front, question side up, and shorten the undo list', () => {
    const state = run(
      { type: 'acted', entry: gradeEntry('a'), now: 10 },
      { type: 'reveal' },
      { type: 'undone', now: 20 },
    )

    expect(state.front.map((c) => c.knowledgeBitId)).toEqual(['a'])
    expect(state).toMatchObject({ revealed: false, shownAt: 20, view: 'reviewing' })
    expect(state.undo).toEqual([])
  })

  it('should walk back grades, suspends and buries newest first in one list', () => {
    const state = run(
      { type: 'acted', entry: gradeEntry('a'), now: 1 },
      { type: 'acted', entry: { kind: 'suspend', card: card('b'), stamp: 1 }, now: 2 },
      { type: 'undone', now: 3 },
    )

    expect(state.front[0]?.knowledgeBitId).toBe('b')
    expect(state.undo.map((e) => e.kind)).toEqual(['grade'])
  })

  it('should not show an undone card twice when it is already waiting at the front', () => {
    const state = run(
      { type: 'acted', entry: gradeEntry('a'), now: 1 },
      { type: 'undone', now: 2 },
      { type: 'acted', entry: gradeEntry('a'), now: 3 },
      { type: 'undone', now: 4 },
    )

    expect(state.front).toHaveLength(1)
  })

  it('should drop only the refused entry and say why', () => {
    const state = run(
      { type: 'acted', entry: gradeEntry('a'), now: 1 },
      { type: 'acted', entry: gradeEntry('b'), now: 2 },
      { type: 'undoDropped', notice: 'nope' },
    )

    expect(state.undo.map((e) => e.card.knowledgeBitId)).toEqual(['a'])
    expect(state.notice).toBe('nope')
  })

  it('should lower the graded tally when a grade from the same batch is undone', () => {
    const state = run(
      { type: 'acted', entry: gradeEntry('a', 'new'), now: 1 },
      { type: 'undone', now: 2 },
    )

    expect(state.tally).toEqual({ stamp: 1, new: 0, review: 0 })
  })

  it('should swap the edited text into every later showing of the card', () => {
    const state = run({
      type: 'editSaved',
      knowledgeBitId: 'a',
      edit: { variantId: 'v-new', replacesVariantId: 'v-a', prompt: 'fixed', answer: 'fixed answer' },
      now: 5,
    })

    expect(applyEdit(card('a'), state.edits)).toMatchObject({ variantId: 'v-new', prompt: 'fixed' })
    expect(applyEdit(card('b'), state.edits).prompt).toBe('prompt b')
  })

  it('should not paste an edit of one variation over a different variation of the same piece', () => {
    const state = run({
      type: 'editSaved',
      knowledgeBitId: 'a',
      edit: { variantId: 'v-new', replacesVariantId: 'v-a', prompt: 'fixed', answer: 'fixed answer' },
      now: 5,
    })
    const otherVariation = { ...card('a'), variantId: 'v-a-other', prompt: 'other wording' }

    expect(applyEdit(otherVariation, state.edits)).toEqual(otherVariation)
  })

  it('should not count the time spent in the editor as answer time', () => {
    const state = run({ type: 'editStarted', now: 100 }, { type: 'editCancelled', now: 400 })

    expect(state.shownAt).toBe(300)
    expect(state.editingSince).toBeNull()
  })

  it('should switch between the review and the summary without losing the session', () => {
    const state = run(
      { type: 'acted', entry: gradeEntry('a'), now: 1 },
      { type: 'summaryShown' },
      { type: 'summaryClosed' },
    )

    expect(state.view).toBe('reviewing')
    expect(state.undo).toHaveLength(1)
  })

  it('should start a refilled batch from its first card', () => {
    const state = run({ type: 'acted', entry: gradeEntry('a'), now: 1 }, { type: 'refilled', now: 9 })

    expect(state.index).toBe(0)
  })
})

describe('ankiReviewSessionReducer when the daily limit empties the queue', () => {
  it('should leave no card to show after the last card is graded and the refill brings nothing', () => {
    const state = run({ type: 'acted', entry: gradeEntry('a'), now: 1 }, { type: 'refilled', now: 9 })

    expect(state.front).toHaveLength(0)
    expect(state.index).toBe(0)
    expect(state.view).toBe('reviewing')
    expect(state.undo).toHaveLength(1)
  })
})

describe('ankiReviewSessionReducer with per-card siblings', () => {
  it('should hide the siblings a grade buried and drop them from the waiting front', () => {
    const sibling = { ...card('a'), variantId: 'v-a2', cardKey: 'cloze:1' }
    const withFront = { ...initialAnkiReviewSession(0), front: [card('a'), sibling] }
    const state = ankiReviewSessionReducer(withFront, {
      type: 'acted',
      entry: gradeEntry('a'),
      now: 10,
      hide: ['v-a2'],
    })

    expect(state.hidden).toEqual(['v-a2'])
    expect(state.front).toEqual([])
  })

  it('should keep a same-note card waiting at the front when a different card is undone', () => {
    const sibling = { ...card('a'), variantId: 'v-a2', cardKey: 'cloze:1' }
    const withFront = { ...initialAnkiReviewSession(0), front: [sibling], undo: [gradeEntry('a')] }
    const state = ankiReviewSessionReducer(withFront, { type: 'undone', now: 5 })

    expect(state.front.map((c) => c.variantId)).toEqual(['v-a', 'v-a2'])
  })

  it('should forget hidden cards once the queue is refilled from the server', () => {
    const state = run(
      { type: 'acted', entry: gradeEntry('a'), now: 1, hide: ['v-x'] },
      { type: 'refilled', now: 2 },
    )

    expect(state.hidden).toEqual([])
  })
})

describe('withoutGradedThisSession', () => {
  const graded = (bit: string, grade: Extract<SessionUndoEntry, { kind: 'grade' }>['grade']): SessionUndoEntry => ({
    ...(gradeEntry(bit) as Extract<SessionUndoEntry, { kind: 'grade' }>),
    grade,
  })

  it('should not bring back a card graded Easy earlier in this session when the queue is refetched', () => {
    const refetched = [card('a'), card('b'), card('c')]

    expect(withoutGradedThisSession(refetched, [graded('a', 'easy'), graded('c', 'easy')]).map((c) => c.variantId)).toEqual(['v-b'])
  })

  it('should not bring back a card graded Good or Hard through learn-ahead refills', () => {
    const refetched = [card('a', 'learning'), card('b', 'learning'), card('c')]

    expect(withoutGradedThisSession(refetched, [graded('a', 'good'), graded('b', 'hard')]).map((c) => c.variantId)).toEqual(['v-c'])
  })

  it('should drop a graded card even when the refetch returns it with different wording', () => {
    const otherWording = { ...card('a'), variantId: 'v-a-alt' }

    expect(withoutGradedThisSession([otherWording], [graded('a', 'good')])).toEqual([])
  })

  it('should keep a card graded Again because it is legitimately due again soon', () => {
    const refetched = [card('a'), card('b')]

    expect(withoutGradedThisSession(refetched, [graded('a', 'again')])).toEqual(refetched)
  })

  it('should use the latest grade of a card when it was graded more than once', () => {
    const refetched = [card('a')]

    expect(withoutGradedThisSession(refetched, [graded('a', 'again'), graded('a', 'good')])).toEqual([])
  })

  it('should show a card again after its grade is undone', () => {
    const refetched = [card('a')]
    const undone = run({ type: 'acted', entry: graded('a', 'good'), now: 1 }, { type: 'undone', now: 2 })

    expect(withoutGradedThisSession(refetched, undone.undo)).toEqual(refetched)
  })

  it('should end up with nothing to review when the refetch only holds cards graded this session', () => {
    const state = run({ type: 'acted', entry: graded('a', 'good'), now: 1 }, { type: 'refilled', now: 2 })

    expect(withoutGradedThisSession([card('a')], state.undo)).toEqual([])
    expect(state.front).toEqual([])
  })
})

describe('ankiReviewSessionReducer rehearsal follow-up', () => {
  const followUp = { ...card('a'), variantId: 'v-a-alt' }

  it('should show the follow-up wording next, marked as rehearsal, after a graded card', () => {
    const state = run({ type: 'acted', entry: gradeEntry('a'), now: 10, followUp })

    expect(state.front.map((c) => c.variantId)).toEqual(['v-a-alt'])
    expect(state.rehearsal).toBe(true)
    expect(state.undo).toHaveLength(1)
  })

  it('should not chain another follow-up after a grade that returns none', () => {
    const state = run(
      { type: 'acted', entry: gradeEntry('a'), now: 10, followUp },
      { type: 'acted', entry: gradeEntry('b'), now: 20 },
    )

    expect(state.rehearsal).toBe(false)
    expect(state.front).toEqual([])
  })

  it('should behave as before when the graded card has no follow-up', () => {
    const state = run({ type: 'acted', entry: gradeEntry('a'), now: 10, followUp: null })

    expect(state.front).toEqual([])
    expect(state.rehearsal).toBe(false)
  })

  it('should leave rehearsal mode and not count a card when the rehearsal is advanced past', () => {
    const state = run({ type: 'acted', entry: gradeEntry('a'), now: 10, followUp }, { type: 'advance', now: 20 })

    expect(state.rehearsal).toBe(false)
    expect(state.front).toEqual([])
    expect(state.undo).toHaveLength(1)
    expect(state.tally).toMatchObject({ review: 1 })
  })

  it('should drop the pending follow-up when the graded card is undone', () => {
    const state = run({ type: 'acted', entry: gradeEntry('a'), now: 10, followUp }, { type: 'undone', now: 20 })

    expect(state.front.map((c) => c.variantId)).toEqual(['v-a'])
    expect(state.rehearsal).toBe(false)
  })
})
