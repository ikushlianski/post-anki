import type { LearningPathStep, ModuleProgress, PathStepProgress, PathStepStatus } from '@post-anki/shared'

import { resolveStepName } from './step-name-map'

export interface StepViewModel {
  domainNodeId: string
  name: string
  order: number
  status: PathStepStatus
  progress: ModuleProgress
  isNext: boolean
}

const EMPTY_PROGRESS: ModuleProgress = {
  topicsIncluded: 0,
  topicsMastered: 0,
  percent: 0,
}

export function buildStepViewModels(
  steps: LearningPathStep[],
  progressSteps: PathStepProgress[],
  nameByNodeId: Map<string, string>,
  nextStepDomainNodeId: string | null,
): StepViewModel[] {
  const progressByNodeId = new Map(
    progressSteps.map((step) => [step.domainNodeId, step]),
  )

  return [...steps]
    .sort((a, b) => a.order - b.order)
    .map((step) => {
      const progress = progressByNodeId.get(step.domainNodeId)

      return {
        domainNodeId: step.domainNodeId,
        name: resolveStepName(step.domainNodeId, nameByNodeId),
        order: step.order,
        status: progress?.status ?? 'not_started',
        progress: progress?.progress ?? EMPTY_PROGRESS,
        isNext: step.domainNodeId === nextStepDomainNodeId,
      }
    })
}
