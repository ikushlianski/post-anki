import type { StudySessionTargetType } from '@post-anki/shared'

export function sessionTargetLabel(
  targetType: StudySessionTargetType | null,
  targetId: string | null,
  namesById: Record<string, string>,
): string {
  if (!targetType || !targetId) {
    return 'Anything'
  }

  const name = namesById[targetId]

  if (targetType === 'curriculum') {
    return name ? `Curriculum: ${name}` : 'Curriculum'
  }

  if (targetType === 'learning_path') {
    return name ? `Learning path: ${name}` : 'Learning path'
  }

  return name ? `Domain: ${name}` : 'Domain'
}
