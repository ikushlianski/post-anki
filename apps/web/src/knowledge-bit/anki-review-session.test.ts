import { describe, expect, it } from 'vitest'
import type { ReviewCard } from '@post-anki/shared'

import {
  ankiReviewSessionReducer,
  applyEdit,
  initialAnkiReviewSession,
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
      edit: { variantId: 'v-new', prompt: 'fixed', answer: 'fixed answer' },
      now: 5,
    })

    expect(applyEdit(card('a'), state.edits)).toMatchObject({ variantId: 'v-new', prompt: 'fixed' })
    expect(applyEdit(card('b'), state.edits).prompt).toBe('prompt b')
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
