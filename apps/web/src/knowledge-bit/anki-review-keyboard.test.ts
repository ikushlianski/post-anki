import { describe, expect, it } from 'vitest'

import { ankiReviewKeyAction } from './anki-review-keyboard'

const plainKey = (key: string) => ({
  key,
  repeat: false,
  ctrlKey: false,
  metaKey: false,
  altKey: false,
  targetIsEditable: false,
})

const hiddenCard = { hasCard: true, revealed: false, busy: false, canUndo: false, editing: false }
const revealedCard = { ...hiddenCard, revealed: true }

describe('ankiReviewKeyAction', () => {
  it('should reveal the answer when the learner presses Space on a hidden card', () => {
    expect(ankiReviewKeyAction(plainKey(' '), hiddenCard)).toEqual({ type: 'reveal' })
  })

  it('should not grade a card before its answer has been revealed', () => {
    expect(ankiReviewKeyAction(plainKey('3'), hiddenCard)).toBeNull()
  })

  it('should map keys 1 to 4 onto Again, Hard, Good and Easy once the answer is shown', () => {
    expect(ankiReviewKeyAction(plainKey('1'), revealedCard)).toEqual({ type: 'grade', grade: 'again' })
    expect(ankiReviewKeyAction(plainKey('2'), revealedCard)).toEqual({ type: 'grade', grade: 'hard' })
    expect(ankiReviewKeyAction(plainKey('3'), revealedCard)).toEqual({ type: 'grade', grade: 'good' })
    expect(ankiReviewKeyAction(plainKey('4'), revealedCard)).toEqual({ type: 'grade', grade: 'easy' })
  })

  it('should do nothing on Space after the answer is already revealed', () => {
    expect(ankiReviewKeyAction(plainKey(' '), revealedCard)).toBeNull()
  })

  it('should ignore keys typed into the chat box or any text field', () => {
    expect(ankiReviewKeyAction({ ...plainKey('2'), targetIsEditable: true }, revealedCard)).toBeNull()
    expect(ankiReviewKeyAction({ ...plainKey(' '), targetIsEditable: true }, hiddenCard)).toBeNull()
  })

  it('should ignore browser shortcuts pressed with Ctrl, Cmd or Alt', () => {
    expect(ankiReviewKeyAction({ ...plainKey('1'), ctrlKey: true }, revealedCard)).toBeNull()
    expect(ankiReviewKeyAction({ ...plainKey('1'), metaKey: true }, revealedCard)).toBeNull()
    expect(ankiReviewKeyAction({ ...plainKey('1'), altKey: true }, revealedCard)).toBeNull()
  })

  it('should grade only once when a key is held down or a grade is still saving', () => {
    expect(ankiReviewKeyAction({ ...plainKey('3'), repeat: true }, revealedCard)).toBeNull()
    expect(ankiReviewKeyAction(plainKey('3'), { ...revealedCard, busy: true })).toBeNull()
  })

  it('should do nothing when there is no card on screen', () => {
    expect(ankiReviewKeyAction(plainKey(' '), { ...hiddenCard, hasCard: false })).toBeNull()
  })

  it('should ignore keys that are not review shortcuts', () => {
    expect(ankiReviewKeyAction(plainKey('5'), revealedCard)).toBeNull()
    expect(ankiReviewKeyAction(plainKey('Enter'), hiddenCard)).toBeNull()
  })
  it('should undo on Z or Ctrl/Cmd+Z, even on the done screen, but only when there is something to undo', () => {
    const undoable = { ...hiddenCard, hasCard: false, canUndo: true }

    expect(ankiReviewKeyAction(plainKey('z'), undoable)).toEqual({ type: 'undo' })
    expect(ankiReviewKeyAction({ ...plainKey('z'), ctrlKey: true }, undoable)).toEqual({ type: 'undo' })
    expect(ankiReviewKeyAction({ ...plainKey('z'), metaKey: true }, undoable)).toEqual({ type: 'undo' })
    expect(ankiReviewKeyAction(plainKey('z'), hiddenCard)).toBeNull()
  })

  it('should edit only after the answer is revealed', () => {
    expect(ankiReviewKeyAction(plainKey('e'), hiddenCard)).toBeNull()
    expect(ankiReviewKeyAction(plainKey('e'), revealedCard)).toEqual({ type: 'edit' })
  })

  it('should bury with - and suspend with @ on any card', () => {
    expect(ankiReviewKeyAction(plainKey('-'), hiddenCard)).toEqual({ type: 'bury' })
    expect(ankiReviewKeyAction(plainKey('@'), revealedCard)).toEqual({ type: 'suspend' })
    expect(ankiReviewKeyAction(plainKey('@'), { ...hiddenCard, hasCard: false })).toBeNull()
  })

  it('should ignore every shortcut while the editor is open or an action is saving', () => {
    const editing = { ...revealedCard, canUndo: true, editing: true }
    const saving = { ...revealedCard, canUndo: true, busy: true }

    for (const key of ['z', 'e', '-', '@', '1', ' ']) {
      expect(ankiReviewKeyAction(plainKey(key), editing)).toBeNull()
      expect(ankiReviewKeyAction(plainKey(key), saving)).toBeNull()
    }
  })
})
