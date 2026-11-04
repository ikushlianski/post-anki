import { createFileRoute, useRouter } from '@tanstack/react-router'

import { getDailyPush } from '../curriculum/curriculum.api'
import { respondToNudge } from '../learning-list/learning-list.api'
import { StartPrompt } from '../study-session/start-prompt'
import { SessionReview } from '../study-session/session-review'
import { SessionRunner } from '../study-session/session-runner'
import {
  endStudySession,
  getStudySession,
  getStudySessionPush,
  recordStudySessionAnswer,
} from '../study-session/study-session.api'
import { pageHead } from '../shared/page-title'

export const Route = createFileRoute('/study-sessions_/$sessionId')({
  head: pageHead('Study session'),
  component: StudySessionDetailPage,
  loader: async ({ params }) => {
    const sessionResult = await getStudySession({ data: params.sessionId })
    const nudgeSource =
      sessionResult.ok && sessionResult.data.status === 'in_progress'
        ? await getDailyPush({ data: 'socratic' })
        : null

    return { sessionResult, nudge: nudgeSource?.nudge ?? null }
  },
})

function StudySessionDetailPage() {
  const { sessionResult, nudge } = Route.useLoaderData()
  const { sessionId } = Route.useParams()
  const router = useRouter()

  if (!sessionResult.ok) {
    return (
      <main className="mx-auto max-w-3xl px-5 py-8 sm:px-8 sm:py-10">
        <p className="text-sm text-neutral-500">Study session not found.</p>
      </main>
    )
  }

  const { data: session } = sessionResult

  return (
    <main className="mx-auto max-w-3xl px-5 py-8 sm:px-8 sm:py-10">
      {session.status === 'planned' ? (
        <StartPrompt
          sessionId={sessionId}
          onStarted={() => router.invalidate()}
        />
      ) : null}

      {session.status === 'in_progress' ? (
        <SessionRunner
          session={session}
          nudge={nudge}
          onLoadPush={async (excludeGapIds) => {
            const result = await getStudySessionPush({
              data: { sessionId, excludeGapIds, mode: 'socratic' },
            })

            return result
          }}
          onRecordAnswer={(correct) =>
            recordStudySessionAnswer({ data: { sessionId, correct } })
          }
          onEnd={(userRequestedEnd) => endStudySession({ data: { sessionId, userRequestedEnd } })}
          onEnded={() => router.invalidate()}
          onRespondNudge={(data) => respondToNudge({ data })}
          onNudgeResponded={() => router.invalidate()}
        />
      ) : null}

      {session.status === 'completed' || session.status === 'abandoned' ? (
        <SessionReview session={session} />
      ) : null}
    </main>
  )
}
