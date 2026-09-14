import type { CurriculumStatus } from './model'

export interface CreationProgress {
  label: string
  percent: number
}

const STEPS: Record<CurriculumStatus, CreationProgress | null> = {
  draft: { label: 'Getting started', percent: 10 },
  curating: { label: 'Finding real sources for this course', percent: 30 },
  awaiting_source_approval: { label: 'Waiting on you to approve sources', percent: 50 },
  shaping_structure: { label: 'Drafting the course outline', percent: 75 },
  ready: null,
  confirmed: null,
  failed: null,
}

export function describeCreationProgress(status: CurriculumStatus): CreationProgress | null {
  return STEPS[status]
}
