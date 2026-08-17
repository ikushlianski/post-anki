import type { StudySessionPushResponse } from '@post-anki/shared'

import { ProbeAnswer } from '../curriculum/probe-answer'
import type { AttemptResult } from '../curriculum/model'
import { mapPushQuestion } from './map-push-question'

export interface SessionQuestionSurfaceProps {
  loading: boolean
  pushResult: StudySessionPushResponse | null
  onAnswered: (result: AttemptResult) => void
}

export function SessionQuestionSurface({
  loading,
  pushResult,
  onAnswered,
}: SessionQuestionSurfaceProps) {
  if (loading || pushResult === null) {
    return (
      <p data-testid="session-question-loading" className="text-sm text-neutral-500">
        Loading…
      </p>
    )
  }

  if (!pushResult.push) {
    return (
      <p data-testid="session-question-empty" className="text-sm text-neutral-500">
        Nothing to study for this target right now.
      </p>
    )
  }

  return (
    <div data-testid="session-question">
      <p className="mb-2 text-xs text-neutral-400">
        {pushResult.push.curriculumName} · {pushResult.push.topicTitle}
      </p>
      <p className="mb-3 text-sm font-medium text-neutral-900">{pushResult.push.gap.label}</p>
      {pushResult.question ? (
        <ProbeAnswer
          key={pushResult.push.gap.id}
          topicId={pushResult.push.topicId}
          mode="socratic"
          question={mapPushQuestion(pushResult.push.topicId, pushResult.question)}
          autoInvalidate={false}
          hideNextControl
          onAnswered={onAnswered}
        />
      ) : (
        <p className="text-sm text-neutral-500">Couldn't load a question right now.</p>
      )}
    </div>
  )
}
