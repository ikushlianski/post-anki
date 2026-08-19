import { Link } from '@tanstack/react-router'

import type { TopSubject } from '@post-anki/shared'

export interface TopSubjectsWidgetProps {
  topSubjects: TopSubject[]
}

function formatRelativeTime(isoTimestamp: string): string {
  const deltaMs = Date.now() - new Date(isoTimestamp).getTime()
  const deltaSeconds = Math.max(0, Math.round(deltaMs / 1000))

  const deltaMinutes = Math.round(deltaSeconds / 60)
  if (deltaMinutes < 1) return 'just now'
  if (deltaMinutes < 60) return `${deltaMinutes} minute${deltaMinutes === 1 ? '' : 's'} ago`

  const deltaHours = Math.round(deltaMinutes / 60)
  if (deltaHours < 24) return `${deltaHours} hour${deltaHours === 1 ? '' : 's'} ago`

  const deltaDays = Math.round(deltaHours / 24)
  if (deltaDays < 30) return `${deltaDays} day${deltaDays === 1 ? '' : 's'} ago`

  const deltaMonths = Math.round(deltaDays / 30)
  if (deltaMonths < 12) return `${deltaMonths} month${deltaMonths === 1 ? '' : 's'} ago`

  const deltaYears = Math.round(deltaMonths / 12)
  return `${deltaYears} year${deltaYears === 1 ? '' : 's'} ago`
}

export function TopSubjectsWidget({ topSubjects }: TopSubjectsWidgetProps) {
  if (topSubjects.length === 0) return null

  return (
    <div
      data-testid="top-subjects-widget"
      className="rounded-lg border border-neutral-200 bg-white p-6"
    >
      <p className="text-sm font-medium text-neutral-700">Subjects you've been studying</p>

      <ul className="mt-4 space-y-2">
        {topSubjects.map((subject) => (
          <li key={subject.subjectId}>
            <Link
              to="/subject/$subjectId/map"
              params={{ subjectId: subject.subjectId }}
              data-testid="top-subjects-widget-item"
              className="flex items-center justify-between gap-3 truncate rounded-lg border border-neutral-200 bg-neutral-50 px-4 py-2 text-sm text-neutral-700 hover:bg-neutral-100"
            >
              <span className="truncate font-medium text-neutral-900">
                {subject.subjectName}
              </span>
              <span className="shrink-0 text-xs text-neutral-400">
                {formatRelativeTime(subject.lastInteractedAt)} ·{' '}
                {subject.topicsTouchedLast30Days} topic
                {subject.topicsTouchedLast30Days === 1 ? '' : 's'} this month
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  )
}
