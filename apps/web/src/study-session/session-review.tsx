import { Link } from '@tanstack/react-router'
import { sessionElapsedMinutes } from '@post-anki/core'

import type { StudySession } from '@post-anki/shared'

export interface SessionReviewProps {
  session: StudySession
}

export function SessionReview({ session }: SessionReviewProps) {
  const elapsedMinutes = sessionElapsedMinutes(
    session.startedAt,
    session.completedAt ?? session.startedAt ?? new Date().toISOString(),
  )

  return (
    <div data-testid="session-review" className="card">
      <h2 className="text-sm font-medium">
        {session.status === 'completed' ? 'Session complete' : 'Session ended'}
      </h2>
      <dl className="mt-4 grid grid-cols-3 gap-4 text-center">
        <div>
          <dt className="text-xs text-neutral-400">Answered</dt>
          <dd data-testid="review-answered" className="text-xl font-semibold text-neutral-900">
            {session.questionsAnswered}
          </dd>
        </div>
        <div>
          <dt className="text-xs text-neutral-400">Correct</dt>
          <dd data-testid="review-correct" className="text-xl font-semibold text-neutral-900">
            {session.questionsCorrect}
          </dd>
        </div>
        <div>
          <dt className="text-xs text-neutral-400">Minutes</dt>
          <dd data-testid="review-minutes" className="text-xl font-semibold text-neutral-900">
            {elapsedMinutes}
          </dd>
        </div>
      </dl>
      <Link
        to="/study-sessions"
        className="mt-4 inline-block text-xs text-neutral-500 hover:text-neutral-900"
      >
        ← Back to study sessions
      </Link>
    </div>
  )
}
