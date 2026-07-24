import type { CurriculumStatus } from './model'

export function needsPreAssessment(curriculum: {
  status: CurriculumStatus
  preAssessmentCompletedAt: string | null
}): boolean {
  return curriculum.status === 'confirmed' && curriculum.preAssessmentCompletedAt === null
}
