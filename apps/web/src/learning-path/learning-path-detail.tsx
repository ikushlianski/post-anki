import { useEffect, useMemo, useState } from 'react'

import type {
  CaptureLearningListItemInput,
  LearningListItem,
  LearningPath,
  LearningPathStep,
  PathProgress,
  RoleTemplate,
} from '@post-anki/shared'

import type { ApiResult as LearningListApiResult } from '../learning-list/learning-list.model'
import { AbandonPathControl } from './abandon-path-control'
import { CompletedPathBanner } from './completed-path-banner'
import { LearningPathStepRow } from './learning-path-step-row'
import { pathStatusLabel } from './path-status-label'
import { buildStepNameMap } from './step-name-map'
import { buildStepViewModels } from './step-view-model'
import type { ApiResult, StepPushResult } from './learning-path.model'

export interface LearningPathDetailProps {
  path: LearningPath
  steps: LearningPathStep[]
  progress: PathProgress
  nextStepDomainNodeId: string | null
  templates: RoleTemplate[]
  subjects: Array<{ id: string; name: string }>
  onLoadStepPush: (stepDomainNodeId: string) => Promise<ApiResult<StepPushResult>>
  onAbandon: (pathId: string) => Promise<ApiResult<LearningPath>>
  onAbandoned: () => void | Promise<void>
  onCapture: (
    input: CaptureLearningListItemInput,
  ) => Promise<LearningListApiResult<LearningListItem>>
  onCaptured: () => void | Promise<void>
}

export function LearningPathDetail({
  path,
  steps,
  progress,
  nextStepDomainNodeId,
  templates,
  subjects,
  onLoadStepPush,
  onAbandon,
  onAbandoned,
  onCapture,
  onCaptured,
}: LearningPathDetailProps) {
  const [expandedStepId, setExpandedStepId] = useState<string | null>(
    nextStepDomainNodeId,
  )
  const [pushByStep, setPushByStep] = useState<Record<string, StepPushResult>>({})
  const [loadingStepId, setLoadingStepId] = useState<string | null>(null)

  const stepModels = useMemo(
    () =>
      buildStepViewModels(
        steps,
        progress.steps,
        buildStepNameMap(templates),
        nextStepDomainNodeId,
      ),
    [steps, progress.steps, templates, nextStepDomainNodeId],
  )

  useEffect(() => {
    if (!expandedStepId || pushByStep[expandedStepId]) {
      return
    }

    const model = stepModels.find((step) => step.domainNodeId === expandedStepId)

    if (!model || model.progress.topicsIncluded === 0) {
      return
    }

    setLoadingStepId(expandedStepId)

    void onLoadStepPush(expandedStepId).then((result) => {
      setLoadingStepId(null)

      if (result.ok) {
        setPushByStep((prev) => ({ ...prev, [expandedStepId]: result.data }))
      }
    })
  }, [expandedStepId])

  function toggle(domainNodeId: string) {
    setExpandedStepId((prev) => (prev === domainNodeId ? null : domainNodeId))
  }

  return (
    <div>
      <header className="mb-6">
        <div className="flex flex-wrap items-center gap-2">
          <h1 className="text-2xl font-semibold tracking-tight">{path.name}</h1>
          <span className="rounded-full bg-neutral-100 px-2 py-0.5 text-[11px] font-medium text-neutral-600">
            {pathStatusLabel(path.status)}
          </span>
        </div>
        <p className="mt-1 text-sm text-neutral-500">{path.targetRoleLabel}</p>
        <div className="mt-3">
          <AbandonPathControl
            pathId={path.id}
            status={path.status}
            onAbandon={onAbandon}
            onAbandoned={onAbandoned}
          />
        </div>
      </header>

      {progress.overallStatus === 'done' ? <CompletedPathBanner /> : null}

      <ul data-testid="learning-path-step-list" className="space-y-3">
        {stepModels.map((step) => (
          <LearningPathStepRow
            key={step.domainNodeId}
            step={step}
            expanded={expandedStepId === step.domainNodeId}
            loading={loadingStepId === step.domainNodeId}
            pushResult={pushByStep[step.domainNodeId]}
            subjects={subjects}
            onToggle={() => toggle(step.domainNodeId)}
            onCapture={onCapture}
            onCaptured={onCaptured}
          />
        ))}
      </ul>
    </div>
  )
}
