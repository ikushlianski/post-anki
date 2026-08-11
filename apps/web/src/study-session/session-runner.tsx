import { useEffect, useState } from 'react'
import { sessionElapsedMinutes, shouldEndSession } from '@post-anki/core'

import type {
  DailyPushNudge,
  NudgeResponseInput,
  StudySession,
  StudySessionPushResponse,
} from '@post-anki/shared'

import { NudgePanel } from '../learning-list/nudge-panel'
import type { AttemptResult } from '../curriculum/model'
import { SessionQuestionSurface } from './session-question-surface'
import { SessionTimerBanner } from './session-timer-banner'
import type { ApiResult } from './study-session.model'

export interface SessionRunnerProps {
  session: StudySession
  nudge: DailyPushNudge | null
  onLoadPush: (excludeGapIds: string[]) => Promise<ApiResult<StudySessionPushResponse>>
  onRecordAnswer: (correct: boolean) => Promise<ApiResult<StudySession>>
  onEnd: (userRequestedEnd: boolean) => Promise<ApiResult<StudySession>>
  onEnded: (session: StudySession) => void | Promise<void>
  onRespondNudge: (input: NudgeResponseInput) => Promise<ApiResult<unknown>>
  onNudgeResponded: () => void | Promise<void>
}

export function SessionRunner({
  session,
  nudge,
  onLoadPush,
  onRecordAnswer,
  onEnd,
  onEnded,
  onRespondNudge,
  onNudgeResponded,
}: SessionRunnerProps) {
  const [excludeGapIds, setExcludeGapIds] = useState<string[]>([])
  const [pushResult, setPushResult] = useState<StudySessionPushResponse | null>(null)
  const [loadingPush, setLoadingPush] = useState(true)
  const [nowIso, setNowIso] = useState(() => new Date().toISOString())
  const [ending, setEnding] = useState(false)

  useEffect(() => {
    let cancelled = false
    setLoadingPush(true)

    onLoadPush(excludeGapIds).then((result) => {
      if (cancelled) {
        return
      }

      setLoadingPush(false)

      if (result.ok) {
        setPushResult(result.data)
      }
    })

    return () => {
      cancelled = true
    }
  }, [excludeGapIds])

  useEffect(() => {
    const interval = setInterval(() => setNowIso(new Date().toISOString()), 1000)

    return () => clearInterval(interval)
  }, [])

  const elapsedMinutes = sessionElapsedMinutes(session.startedAt, nowIso)
  const timeUp = shouldEndSession({
    startedAt: session.startedAt,
    plannedDurationMinutes: session.plannedDurationMinutes,
    now: nowIso,
    userRequestedEnd: false,
  })

  async function handleAnswered(result: AttemptResult) {
    const gapId = pushResult?.push?.gap.id ?? null

    await onRecordAnswer(result.outcome === 'pass')

    if (gapId) {
      setExcludeGapIds((prev) => [...prev, gapId])
    }
  }

  async function handleEnd(userRequestedEnd: boolean) {
    setEnding(true)
    const result = await onEnd(userRequestedEnd)
    setEnding(false)

    if (result.ok) {
      await onEnded(result.data)
    }
  }

  return (
    <div data-testid="session-runner">
      {nudge ? (
        <NudgePanel
          key={`${nudge.entityType}:${nudge.entityId}`}
          nudge={nudge}
          onRespond={onRespondNudge}
          onResponded={onNudgeResponded}
        />
      ) : null}
      <SessionTimerBanner
        elapsedMinutes={elapsedMinutes}
        plannedDurationMinutes={session.plannedDurationMinutes}
        timeUp={timeUp}
        ending={ending}
        onEndNow={() => void handleEnd(true)}
      />
      <div className="rounded-xl border border-neutral-900 bg-white p-6">
        <SessionQuestionSurface
          loading={loadingPush}
          pushResult={pushResult}
          onAnswered={(result) => void handleAnswered(result)}
        />
      </div>
    </div>
  )
}
