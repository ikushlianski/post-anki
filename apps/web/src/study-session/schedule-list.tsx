import { Link } from '@tanstack/react-router'

import type { StudySessionListItem } from '@post-anki/shared'

import { groupScheduleSessions } from './group-schedule-sessions'
import { formatPlannedDuration } from './session-timer'
import { sessionTargetLabel } from './session-target-label'

export interface ScheduleListProps {
  sessions: StudySessionListItem[]
  namesById: Record<string, string>
}

export function ScheduleList({ sessions, namesById }: ScheduleListProps) {
  const { upcoming, active, history } = groupScheduleSessions(sessions)

  return (
    <div data-testid="schedule-list" className="space-y-6">
      <SessionGroup
        title="Active"
        emptyLabel="Nothing in progress."
        sessions={active}
        namesById={namesById}
        testId="schedule-list-active"
      />
      <SessionGroup
        title="Upcoming"
        emptyLabel="Nothing planned. A planned session with a target and a duration will show up here."
        sessions={upcoming}
        namesById={namesById}
        testId="schedule-list-upcoming"
      />
      <SessionGroup
        title="History"
        emptyLabel="No sessions finished yet."
        sessions={history}
        namesById={namesById}
        testId="schedule-list-history"
      />
    </div>
  )
}

function SessionGroup({
  title,
  emptyLabel,
  sessions,
  namesById,
  testId,
}: {
  title: string
  emptyLabel: string
  sessions: StudySessionListItem[]
  namesById: Record<string, string>
  testId: string
}) {
  return (
    <section data-testid={testId}>
      <h3 className="mb-2 text-xs font-medium uppercase tracking-wide text-neutral-400">
        {title}
      </h3>
      {sessions.length === 0 ? (
        <p className="text-sm text-neutral-500">{emptyLabel}</p>
      ) : (
        <ul className="space-y-2">
          {sessions.map((session) => (
            <li
              key={session.id}
              data-testid="schedule-list-item"
              className="flex items-center justify-between gap-3 rounded-lg border border-neutral-200 bg-white px-4 py-3"
            >
              <div>
                <p className="text-sm font-medium text-neutral-900">
                  {sessionTargetLabel(session.targetType, session.targetId, namesById)}
                </p>
                <p className="text-xs text-neutral-400">
                  {formatPlannedDuration(session.plannedDurationMinutes)}
                  {session.status !== 'planned' ? ` · ${session.status}` : ''}
                </p>
              </div>
              <Link
                to="/study-sessions/$sessionId"
                params={{ sessionId: session.id }}
                data-testid="schedule-list-item-link"
                className="shrink-0 text-xs font-medium text-neutral-500 hover:text-neutral-900"
              >
                {session.status === 'planned' ? 'Open →' : session.status === 'in_progress' ? 'Resume →' : 'Review →'}
              </Link>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}
