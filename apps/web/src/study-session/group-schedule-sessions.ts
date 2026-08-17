import type { StudySessionListItem } from '@post-anki/shared'

export interface GroupedScheduleSessions {
  upcoming: StudySessionListItem[]
  active: StudySessionListItem[]
  history: StudySessionListItem[]
}

export function groupScheduleSessions(
  sessions: StudySessionListItem[],
): GroupedScheduleSessions {
  const upcoming: StudySessionListItem[] = []
  const active: StudySessionListItem[] = []
  const history: StudySessionListItem[] = []

  for (const session of sessions) {
    if (session.missed) {
      continue
    }

    if (session.status === 'planned') {
      upcoming.push(session)
      continue
    }

    if (session.status === 'in_progress') {
      active.push(session)
      continue
    }

    history.push(session)
  }

  return { upcoming, active, history }
}
