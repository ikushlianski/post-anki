import { createFileRoute, useRouter } from '@tanstack/react-router'

import { getDailyPush } from '../curriculum/curriculum.api'
import { respondToNudge } from '../learning-list/learning-list.api'
import { SessionReview } from '../study-session/session-review'
import { SessionRunner } from '../study-session/session-runner'
import {
  endStudySession,
  getStudySession,
  getStudySessionPush,
  recordStudySessionAnswer,
  startStudySession,
} from '../study-session/study-session.api'

export const Route = createFileRoute('/study-sessions/$sessionId')({
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

function StartPrompt({
  sessionId,
  onStarted,
}: {
  sessionId: string
  onStarted: () => void | Promise<void>
}) {
  return (
    <div
      data-testid="session-start-prompt"
      className="card text-center"
    >
      <p className="mb-4 text-sm text-neutral-500">Ready when you are.</p>
      <button
        type="button"
        data-testid="session-start-button"
        onClick={() => {
          void startStudySession({ data: sessionId }).then((result) => {
            if (result.ok) {
              void onStarted()
            }
          })
        }}
        className="btn-primary"
      >
        Start session
      </button>
    </div>
  )
}
