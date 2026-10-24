import type { ReviewCard, ReviewGrade } from '@post-anki/shared'

export type SessionUndoEntry =
  | {
      kind: 'grade'
      reviewId: string
      card: ReviewCard
      grade: ReviewGrade
      durationMs: number
      leechSuspended: boolean
      stamp: number
    }
  | { kind: 'suspend' | 'bury'; card: ReviewCard; stamp: number }

export interface SessionTally {
  stamp: number
  new: number
  review: number
}

export interface SessionEdit {
  variantId: string
  replacesVariantId: string
  prompt: string
  answer: string
}

export interface AnkiReviewSessionState {
  index: number
  front: ReviewCard[]
  revealed: boolean
  shownAt: number
  editingSince: number | null
  undo: SessionUndoEntry[]
  edits: Record<string, SessionEdit>
  tally: SessionTally | null
  view: 'reviewing' | 'summary'
  notice: string | null
}

export type AnkiReviewSessionAction =
  | { type: 'reveal' }
  | { type: 'advance'; now: number }
  | { type: 'refilled'; now: number }
  | { type: 'acted'; entry: SessionUndoEntry; now: number; notice?: string }
  | { type: 'undone'; now: number }
  | { type: 'undoDropped'; notice: string }
  | { type: 'editStarted'; now: number }
  | { type: 'editCancelled'; now: number }
  | { type: 'editSaved'; knowledgeBitId: string; edit: SessionEdit; now: number }
  | { type: 'summaryShown' }
  | { type: 'summaryClosed' }

export function initialAnkiReviewSession(now: number): AnkiReviewSessionState {
  return {
    index: 0,
    front: [],
    revealed: false,
    shownAt: now,
    editingSince: null,
    undo: [],
    edits: {},
    tally: null,
    view: 'reviewing',
    notice: null,
  }
}

export function applyEdit(card: ReviewCard, edits: Record<string, SessionEdit>): ReviewCard {
  const edit = edits[card.knowledgeBitId]

  if (!edit || (card.variantId !== edit.replacesVariantId && card.variantId !== edit.variantId)) {
    return card
  }

  return { ...card, variantId: edit.variantId, prompt: edit.prompt, answer: edit.answer }
}

function shiftTally(
  tally: SessionTally | null,
  stamp: number,
  card: ReviewCard,
  step: 1 | -1,
): SessionTally | null {
  if (step === -1 && (!tally || tally.stamp !== stamp)) {
    return tally
  }

  const base = tally && tally.stamp === stamp ? tally : { stamp, new: 0, review: 0 }
  const key = card.phase === 'new' ? 'new' : 'review'

  return { ...base, [key]: Math.max(0, base[key] + step) }
}

function moveOn(state: AnkiReviewSessionState, now: number): AnkiReviewSessionState {
  return {
    ...state,
    front: state.front.slice(1),
    index: state.front.length > 0 ? state.index : state.index + 1,
    revealed: false,
    shownAt: now,
    editingSince: null,
  }
}

export function ankiReviewSessionReducer(
  state: AnkiReviewSessionState,
  action: AnkiReviewSessionAction,
): AnkiReviewSessionState {
  switch (action.type) {
    case 'reveal':
      return { ...state, revealed: true }
    case 'advance':
      return { ...moveOn(state, action.now), notice: null }
    case 'refilled':
      return { ...state, index: 0, revealed: false, shownAt: action.now }
    case 'acted':
      return {
        ...moveOn(state, action.now),
        undo: [...state.undo, action.entry],
        tally: shiftTally(state.tally, action.entry.stamp, action.entry.card, 1),
        notice: action.notice ?? null,
      }
    case 'undone': {
      const entry = state.undo[state.undo.length - 1]

      if (!entry) {
        return state
      }

      return {
        ...state,
        front: [entry.card, ...state.front.filter((card) => card.knowledgeBitId !== entry.card.knowledgeBitId)],
        undo: state.undo.slice(0, -1),
        tally: shiftTally(state.tally, entry.stamp, entry.card, -1),
        revealed: false,
        shownAt: action.now,
        editingSince: null,
        view: 'reviewing',
        notice: null,
      }
    }
    case 'undoDropped':
      return { ...state, undo: state.undo.slice(0, -1), notice: action.notice }
    case 'editStarted':
      return { ...state, editingSince: action.now }
    case 'editCancelled':
      return endEditing(state, action.now)
    case 'editSaved':
      return {
        ...endEditing(state, action.now),
        edits: { ...state.edits, [action.knowledgeBitId]: action.edit },
      }
    case 'summaryShown':
      return { ...state, view: 'summary' }
    case 'summaryClosed':
      return { ...state, view: 'reviewing' }
  }
}

function endEditing(state: AnkiReviewSessionState, now: number): AnkiReviewSessionState {
  if (state.editingSince === null) {
    return state
  }

  return { ...state, editingSince: null, shownAt: state.shownAt + (now - state.editingSince) }
}
