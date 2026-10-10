import type { ReviewCounts, ReviewGrade } from '@post-anki/shared'

import type { SessionTally, SessionUndoEntry } from './anki-review-session'

export interface SessionStats {
  reviewed: number
  byGrade: Record<ReviewGrade, number>
  recalledShare: number
  newStudied: number
  totalMs: number
  averageMs: number
  suspended: number
  buried: number
  leeches: number
  edited: number
  done: number
  remaining: number
}

export function deriveSessionStats(
  undo: SessionUndoEntry[],
  editedCount: number,
  counts: ReviewCounts | null,
  tally: SessionTally | null,
  stamp: number,
): SessionStats {
  const byGrade: Record<ReviewGrade, number> = { again: 0, hard: 0, good: 0, easy: 0 }
  let reviewed = 0
  let newStudied = 0
  let totalMs = 0
  let suspended = 0
  let buried = 0
  let leeches = 0

  for (const entry of undo) {
    if (entry.kind !== 'grade') {
      suspended += entry.kind === 'suspend' ? 1 : 0
      buried += entry.kind === 'bury' ? 1 : 0
    } else {
      reviewed += 1
      byGrade[entry.grade] += 1
      totalMs += entry.durationMs
      newStudied += entry.card.phase === 'new' ? 1 : 0
      leeches += entry.leechSuspended ? 1 : 0
    }
  }

  const graded = tally && tally.stamp === stamp ? tally.new + tally.review : 0
  const serverLeft = counts ? counts.new + counts.learning + counts.review : 0

  return {
    reviewed,
    byGrade,
    recalledShare: reviewed === 0 ? 0 : (reviewed - byGrade.again) / reviewed,
    newStudied,
    totalMs,
    averageMs: reviewed === 0 ? 0 : Math.round(totalMs / reviewed),
    suspended,
    buried,
    leeches,
    edited: editedCount,
    done: undo.length,
    remaining: Math.max(0, serverLeft - graded),
  }
}
