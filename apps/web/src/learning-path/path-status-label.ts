import type { LearningPathStatus, PathStepStatus } from '@post-anki/shared'

const PATH_STATUS_LABEL: Record<LearningPathStatus, string> = {
  draft: 'Draft',
  active: 'In progress',
  completed: 'Completed',
  abandoned: 'Abandoned',
}

export function pathStatusLabel(status: LearningPathStatus): string {
  return PATH_STATUS_LABEL[status]
}

const STEP_STATUS_LABEL: Record<PathStepStatus, string> = {
  not_started: 'Not started',
  in_progress: 'In progress',
  done: 'Done',
}

export function stepStatusLabel(status: PathStepStatus): string {
  return STEP_STATUS_LABEL[status]
}
