import type { RoleTemplateTarget } from '@post-anki/shared'

const MAX_PREVIEW_TARGETS = 4

export function formatRoleTemplatePreview(targets: RoleTemplateTarget[]): string {
  if (targets.length === 0) {
    return 'No steps resolve yet'
  }

  const names = targets.slice(0, MAX_PREVIEW_TARGETS).map((target) => target.name)
  const remaining = targets.length - names.length

  return remaining > 0
    ? `${names.join(' → ')} → +${remaining} more`
    : names.join(' → ')
}
