import type { StudySessionTargetType } from '@post-anki/shared'

export type ScheduleTargetKind = 'anything' | 'curriculum' | 'learning_path'

export interface ScheduleTargetSelection {
  kind: ScheduleTargetKind
  id: string | null
}

export interface ResolvedScheduleTarget {
  targetType: StudySessionTargetType | null
  targetId: string | null
}

export function resolveScheduleTarget(
  selection: ScheduleTargetSelection,
): ResolvedScheduleTarget {
  if (selection.kind === 'anything' || !selection.id) {
    return { targetType: null, targetId: null }
  }

  return { targetType: selection.kind, targetId: selection.id }
}
