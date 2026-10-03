// Kept in sync with the server's own fixed [10, 20, 30] question-count menu
// (apps/api/src/probe-session/probe-session.service.ts, EXAM_TARGET_COUNTS) —
// this file only computes the CLIENT-SIDE countdown; the server has no
// concept of a time limit (architecture.md's explicit scope cut), so there
// is nothing to keep this constant in sync with on that side beyond the
// question count itself.
export const EXAM_SECONDS_PER_QUESTION = 60

export function examDurationSeconds(total: number): number {
  return total * EXAM_SECONDS_PER_QUESTION
}

// `createdAt` (the session's own, already-persisted timestamp) is the only
// input the timer needs — no new server field, per architecture.md's
// "timer is client-only, no new column" decision. Correct across a reload:
// re-deriving from the same `createdAt` on every mount always yields the
// same remaining time a continuously-running timer would have reached.
export function examSecondsRemaining(createdAt: string, total: number, nowMs: number): number {
  const elapsedSeconds = Math.floor((nowMs - new Date(createdAt).getTime()) / 1000)

  return Math.max(0, examDurationSeconds(total) - elapsedSeconds)
}

export function formatRemaining(seconds: number): string {
  const minutes = Math.floor(seconds / 60)
  const secs = seconds % 60

  return `${minutes}:${String(secs).padStart(2, '0')}`
}
