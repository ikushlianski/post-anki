import { Link } from '@tanstack/react-router'

import type { StudySessionListItem } from '@post-anki/shared'

import { sessionTargetLabel } from '../study-session/session-target-label'

export interface ContinueSessionCardProps {
  session: StudySessionListItem | null
  namesById: Record<string, string>
}

export function ContinueSessionCard({ session, namesById }: ContinueSessionCardProps) {
  if (!session) {
    return null
  }

  return (
    <div
      data-testid="continue-session-card"
      className="alert alert-warning mb-6 flex items-center justify-between gap-4"
    >
      <div>
        <p className="text-sm font-medium text-orange-900">Pick up where you left off</p>
        <p className="text-xs text-orange-700">
          {sessionTargetLabel(session.targetType, session.targetId, namesById)}
        </p>
      </div>
      <Link
        to="/study-sessions/$sessionId"
        params={{ sessionId: session.id }}
        data-testid="continue-session-card-cta"
        className="btn-primary shrink-0"
      >
        Continue →
      </Link>
    </div>
  )
}
