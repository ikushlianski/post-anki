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

const hiddenCard = { hasCard: true, revealed: false, busy: false }
const revealedCard = { hasCard: true, revealed: true, busy: false }

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
    expect(ankiReviewKeyAction(plainKey(' '), { hasCard: false, revealed: false, busy: false })).toBeNull()
  })

  it('should ignore keys that are not review shortcuts', () => {
    expect(ankiReviewKeyAction(plainKey('5'), revealedCard)).toBeNull()
    expect(ankiReviewKeyAction(plainKey('Enter'), hiddenCard)).toBeNull()
  })
})
