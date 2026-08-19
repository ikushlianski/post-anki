import type { StudySessionListItem } from '@post-anki/shared'

const STALE_MS = 24 * 60 * 60 * 1000

export function selectResumableSession(
  sessions: StudySessionListItem[],
  now: Date,
): StudySessionListItem | null {
  return (
    sessions
      .filter(
        (session) =>
          session.status === 'in_progress' &&
          session.startedAt &&
          now.getTime() - new Date(session.startedAt).getTime() <= STALE_MS,
      )
      .sort((a, b) => (b.startedAt ?? '').localeCompare(a.startedAt ?? ''))[0] ?? null
  )
}
