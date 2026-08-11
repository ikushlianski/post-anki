import type { RoleTemplate } from '@post-anki/shared'

export function buildStepNameMap(templates: RoleTemplate[]): Map<string, string> {
  const map = new Map<string, string>()

  for (const template of templates) {
    for (const target of template.targets) {
      if (!map.has(target.domainNodeId)) {
        map.set(target.domainNodeId, target.name)
      }
    }
  }

  return map
}

export function resolveStepName(
  domainNodeId: string,
  nameByNodeId: Map<string, string>,
): string {
  return nameByNodeId.get(domainNodeId) ?? 'Untitled step'
}
