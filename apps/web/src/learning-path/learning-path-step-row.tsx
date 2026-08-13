import type { CaptureLearningListItemInput, LearningListItem } from '@post-anki/shared'

import { ProbeAnswer } from '../curriculum/probe-answer'
import { ProgressBar } from '../curriculum/progress-bar'
import { CaptureForm } from '../learning-list/capture-form'
import type { ApiResult as LearningListApiResult } from '../learning-list/learning-list.model'
import { mapPushQuestion } from './map-push-question'
import { stepStatusLabel } from './path-status-label'
import type { StepViewModel } from './step-view-model'
import type { StepPushResult } from './learning-path.model'

export interface LearningPathStepRowProps {
  step: StepViewModel
  expanded: boolean
  loading: boolean
  pushResult: StepPushResult | undefined
  subjects: Array<{ id: string; name: string }>
  onToggle: () => void
  onCapture: (
    input: CaptureLearningListItemInput,
  ) => Promise<LearningListApiResult<LearningListItem>>
  onCaptured: () => void | Promise<void>
}

export function LearningPathStepRow({
  step,
  expanded,
  loading,
  pushResult,
  subjects,
  onToggle,
  onCapture,
  onCaptured,
}: LearningPathStepRowProps) {
  const isEmpty = step.progress.topicsIncluded === 0

  return (
    <li
      data-testid="learning-path-step"
      data-next={step.isNext}
      data-status={step.status}
      className={`rounded-xl border bg-white p-4 ${
        step.isNext ? 'border-neutral-900' : 'border-neutral-200'
      }`}
    >
      <button
        type="button"
        onClick={onToggle}
        data-testid="learning-path-step-toggle"
        className="flex w-full items-center justify-between gap-3 text-left"
      >
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="truncate text-sm font-medium text-neutral-900">
              {step.name}
            </h3>
            {step.isNext ? (
              <span
                data-testid="learning-path-step-next-badge"
                className="rounded-full bg-neutral-900 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-white"
              >
                Next
              </span>
            ) : null}
          </div>
          <p className="mt-1 text-xs text-neutral-400">
            {stepStatusLabel(step.status)} · {step.progress.topicsMastered}/
            {step.progress.topicsIncluded} topics mastered · {step.progress.percent}%
          </p>
          <div className="mt-2">
            <ProgressBar percent={step.progress.percent} />
          </div>
        </div>
        <span className="shrink-0 text-xs text-neutral-400">
          {expanded ? '▲' : '▼'}
        </span>
      </button>

      {expanded ? (
        <div className="mt-4 border-t border-neutral-100 pt-4">
          {isEmpty ? (
            <EmptyStepCta
              subjects={subjects}
              onCapture={onCapture}
              onCaptured={onCaptured}
            />
          ) : (
            <StepStudySurface loading={loading} pushResult={pushResult} />
          )}
        </div>
      ) : null}
    </li>
  )
}

function EmptyStepCta({
  subjects,
  onCapture,
  onCaptured,
}: {
  subjects: Array<{ id: string; name: string }>
  onCapture: LearningPathStepRowProps['onCapture']
  onCaptured: LearningPathStepRowProps['onCaptured']
}) {
  return (
    <div data-testid="learning-path-step-empty-cta">
      <p className="mb-3 text-xs text-neutral-500">
        Nothing captured here yet. Add something to learn and it counts toward this
        step once it's confirmed.
      </p>
      <CaptureForm subjects={subjects} onCapture={onCapture} onCaptured={onCaptured} />
    </div>
  )
}

function StepStudySurface({
  loading,
  pushResult,
}: {
  loading: boolean
  pushResult: StepPushResult | undefined
}) {
  if (loading || pushResult === undefined) {
    return (
      <p data-testid="learning-path-step-loading" className="text-sm text-neutral-500">
        Loading…
      </p>
    )
  }

  if (!pushResult.push) {
    return (
      <p
        data-testid="learning-path-step-nothing-to-study"
        className="text-sm text-neutral-500"
      >
        Nothing to study here right now.
      </p>
    )
  }

  return (
    <div data-testid="learning-path-step-question">
      <p className="mb-2 text-xs text-neutral-400">
        {pushResult.push.curriculumName} · {pushResult.push.topicTitle}
      </p>
      <p className="mb-3 text-sm font-medium text-neutral-900">
        {pushResult.push.gap.label}
      </p>
      {pushResult.question ? (
        <ProbeAnswer
          topicId={pushResult.push.topicId}
          mode="socratic"
          question={mapPushQuestion(pushResult.push.topicId, pushResult.question)}
          autoInvalidate={false}
        />
      ) : (
        <p className="text-sm text-neutral-500">Couldn't load a question right now.</p>
      )}
    </div>
  )
}
