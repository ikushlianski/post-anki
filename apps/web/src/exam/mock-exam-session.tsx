import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import type { ProbeScope } from '@post-anki/shared'

import { getActiveProbeSession, prepareProbeSession } from '../curriculum/probe-session.api'
import { probeSessionQueryKey, ProbeSessionQuiz } from '../curriculum/probe-session-quiz'
import { ExamCountdown } from './exam-countdown'
import type { ExamScopeOption } from './exam-scope-options'
import { MockExamScore } from './mock-exam-score'
import { MockExamStart, type ExamQuestionCount } from './mock-exam-start'

export function MockExamSession({
  scope,
  scopeId,
  scopeOptions,
  onScopeChange,
}: {
  // Driven by the route's own search params (defaults to curriculum scope).
  scope: ProbeScope
  scopeId: string
  scopeOptions: ExamScopeOption[]
  // Commits a freshly picked scope to the URL so a reload resumes it (S4).
  onScopeChange: (scope: ProbeScope, scopeId: string) => void
}) {
  const queryClient = useQueryClient()
  const queryKey = probeSessionQueryKey(scope, scopeId, 'exam')
  // Set once the client-side countdown reaches zero — never cleared, so a
  // learner can't "un-expire" the exam by waiting for a re-render.
  const [timedOut, setTimedOut] = useState(false)
  // Set by "Take another exam" — shows the count/scope picker again instead
  // of silently resubmitting the finished exam's own `total` (which, if the
  // model under-generated, can be a count outside the fixed menu and get
  // rejected — the learner re-picks a real menu value every time instead).
  const [retaking, setRetaking] = useState(false)

  const { data: session, isLoading } = useQuery({
    queryKey,
    queryFn: () => getActiveProbeSession({ data: { scope, scopeId, mode: 'exam' } }),
  })

  const startMutation = useMutation({
    // prepareProbeSession's own client wrapper (api-client.ts) swallows a
    // failed generation call into a resolved `null`, not a rejection — so a
    // null result here is treated as a failure explicitly, rather than
    // silently caching `null` as "the session" and bouncing back to this
    // same start screen with no error shown at all.
    mutationFn: async ({
      targetCount,
      scope: pickedScope,
      scopeId: pickedScopeId,
    }: {
      targetCount: ExamQuestionCount
      scope: ProbeScope
      scopeId: string
    }) => {
      const result = await prepareProbeSession({
        data: {
          scope: pickedScope,
          scopeId: pickedScopeId,
          allowMultiSelect: true,
          mode: 'exam',
          targetCount,
        },
      })

      if (!result) {
        throw new Error('prepareProbeSession returned no session')
      }

      return result
    },
    onSuccess: (result, variables) => {
      queryClient.setQueryData(
        probeSessionQueryKey(variables.scope, variables.scopeId, 'exam'),
        result,
      )
      onScopeChange(variables.scope, variables.scopeId)
    },
  })

  // A timed-out (or completed) exam's session row stays active forever —
  // the server has no concept of expiry (architecture.md's scope cut) — so
  // the only way back to a fresh exam is `regenerate: true`. The server
  // closes the old session out as completed rather than deleting it (its
  // answers stay in answered-question history/analytics), then generates a
  // brand-new one at the freshly chosen count.
  const retakeMutation = useMutation({
    // Same null-swallowing hazard as startMutation above.
    mutationFn: async ({
      targetCount,
      scope: pickedScope,
      scopeId: pickedScopeId,
    }: {
      targetCount: ExamQuestionCount
      scope: ProbeScope
      scopeId: string
    }) => {
      const result = await prepareProbeSession({
        data: {
          scope: pickedScope,
          scopeId: pickedScopeId,
          allowMultiSelect: true,
          mode: 'exam',
          targetCount,
          regenerate: true,
        },
      })

      if (!result) {
        throw new Error('prepareProbeSession returned no session')
      }

      return result
    },
    onSuccess: (result, variables) => {
      setTimedOut(false)
      setRetaking(false)
      queryClient.setQueryData(
        probeSessionQueryKey(variables.scope, variables.scopeId, 'exam'),
        result,
      )
      onScopeChange(variables.scope, variables.scopeId)
    },
  })

  if (isLoading) {
    return (
      <div className="mt-3 rounded-md border border-neutral-200 bg-neutral-50 p-4">
        <p className="text-sm text-neutral-400">Checking for an active exam…</p>
      </div>
    )
  }

  if (!session || retaking) {
    const initialScope =
      scopeOptions.find((option) => option.scope === scope && option.scopeId === scopeId) ??
      scopeOptions[0]

    return (
      <MockExamStart
        busy={retaking ? retakeMutation.isPending : startMutation.isPending}
        scopeOptions={scopeOptions}
        initialScope={initialScope}
        onStart={(targetCount, pickedScope) =>
          retaking
            ? retakeMutation.mutate({ targetCount, scope: pickedScope.scope, scopeId: pickedScope.scopeId })
            : startMutation.mutate({ targetCount, scope: pickedScope.scope, scopeId: pickedScope.scopeId })
        }
        error={
          (retaking ? retakeMutation.isError : startMutation.isError)
            ? "Couldn't generate the exam right now. Try again."
            : null
        }
      />
    )
  }

  // Complete either because every question was answered (server-derived
  // status) or because the client's own timer ran out — S8: ProbeSessionQuiz
  // is unmounted the instant this flips (never rendered alongside the score
  // screen below), which is what actually blocks a learner from answering
  // further, not a `locked` prop passed into a still-mounted quiz.
  const complete = timedOut || session.status === 'completed'

  return (
    <div data-testid="mock-exam-session">
      {!complete ? (
        <ExamCountdown
          createdAt={session.createdAt}
          total={session.total}
          onExpire={() => setTimedOut(true)}
        />
      ) : null}

      {complete ? (
        <MockExamScore
          correct={session.correct}
          total={session.total}
          answered={session.answered}
          timedOut={timedOut && session.status !== 'completed'}
          onRetake={() => setRetaking(true)}
        />
      ) : (
        <ProbeSessionQuiz scope={scope} scopeId={scopeId} mode="exam" />
      )}
    </div>
  )
}
