import { describe, expect, it } from 'vitest'
import type { ReviewCard, ReviewGrade } from '@post-anki/shared'

import type { SessionUndoEntry } from './anki-review-session'
import { deriveSessionStats } from './anki-review-session-stats'

const card = (phase: ReviewCard['phase']): ReviewCard => ({
  variantId: 'v',
  knowledgeBitId: 'b',
  kind: 'wh_question',
  prompt: 'p',
  answer: 'a',
  background: null,
  isAiGenerated: false,
  sourceLinks: [],
  phase,
  leech: false,
  intervalPreview: { again: 60, hard: 60, good: 60, easy: 60 },
})

const graded = (
  grade: ReviewGrade,
  durationMs: number,
  phase: ReviewCard['phase'] = 'review',
  leechSuspended = false,
  points: { awarded: number; leveledUp: boolean; level: number } = { awarded: 3, leveledUp: false, level: 1 },
): SessionUndoEntry => ({
  kind: 'grade',
  reviewId: 'r',
  card: card(phase),
  grade,
  durationMs,
  leechSuspended,
  points,
  stamp: 1,
})

describe('deriveSessionStats', () => {
  it('should total grades, recalled share, new cards and time for the summary', () => {
    const stats = deriveSessionStats(
      [graded('again', 4000), graded('good', 2000, 'new'), graded('easy', 6000), graded('hard', 0)],
      0,
      null,
      null,
      1,
    )

    expect(stats.reviewed).toBe(4)
    expect(stats.byGrade).toEqual({ again: 1, hard: 1, good: 1, easy: 1 })
    expect(stats.recalledShare).toBe(0.75)
    expect(stats.newStudied).toBe(1)
    expect(stats.totalMs).toBe(12000)
    expect(stats.averageMs).toBe(3000)
  })

  it('should count suspended, buried, leech and edited cards without counting them as reviewed', () => {
    const stats = deriveSessionStats(
      [
        { kind: 'suspend', card: card('review'), stamp: 1 },
        { kind: 'bury', card: card('review'), stamp: 1 },
        graded('again', 1000, 'review', true),
      ],
      2,
      null,
      null,
      1,
    )

    expect(stats).toMatchObject({ suspended: 1, buried: 1, leeches: 1, edited: 2, reviewed: 1, done: 3 })
  })

  it('should show an empty session as zeros without dividing by zero', () => {
    const stats = deriveSessionStats([], 0, null, null, 1)

    expect(stats).toMatchObject({ reviewed: 0, recalledShare: 0, averageMs: 0, done: 0 })
  })

  it('should never report a negative number of cards left', () => {
    const stats = deriveSessionStats(
      [graded('good', 1)],
      0,
      { new: 0, learning: 0, review: 1 },
      { stamp: 1, new: 0, review: 3 },
      1,
    )

    expect(stats.remaining).toBe(0)
  })

  it('should lower the counts once a grade is undone', () => {
    const undo = [graded('good', 1000), graded('again', 1000)]

    expect(deriveSessionStats(undo, 0, null, null, 1).reviewed).toBe(2)
    expect(deriveSessionStats(undo.slice(0, 1), 0, null, null, 1).reviewed).toBe(1)
  })

  it('should sum points earned this session and drop them again when a grade is undone', () => {
    const entries = [graded('good', 2000), graded('easy', 2000, 'review', false, { awarded: 4, leveledUp: true, level: 2 })]
    const full = deriveSessionStats(entries, 0, null, null, 1)
    const undone = deriveSessionStats(entries.slice(0, 1), 0, null, null, 1)

    expect(full.pointsEarned).toBe(7)
    expect(full.leveledUp).toBe(true)
    expect(full.levelReached).toBe(2)
    expect(undone.pointsEarned).toBe(3)
    expect(undone.leveledUp).toBe(false)
    expect(undone.levelReached).toBeNull()
  })
})
