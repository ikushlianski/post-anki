import type { DomainNodeTreeItem } from '@post-anki/shared'

export interface FlatDomainOption {
  id: string
  label: string
  depth: number
}

export function flattenDomainOptions(
  nodes: DomainNodeTreeItem[],
  depth = 0,
): FlatDomainOption[] {
  return nodes.flatMap((node) => [
    { id: node.id, label: node.name, depth },
    ...flattenDomainOptions(node.children, depth + 1),
  ])
}

export function findDomainPath(
  nodes: DomainNodeTreeItem[],
  nodeId: string,
  trail: string[] = [],
): string[] | null {
  for (const node of nodes) {
    const nextTrail = [...trail, node.name]

    if (node.id === nodeId) {
      return nextTrail
    }

    const found = findDomainPath(node.children, nodeId, nextTrail)

    if (found) {
      return found
    }
  }

  return null
}

export function hasStaticTaxonomy(nodes: DomainNodeTreeItem[]): boolean {
  return nodes.some(
    (node) => node.source === 'static_taxonomy' || hasStaticTaxonomy(node.children),
  )
}

export function flattenDomainNodeNames(
  nodes: DomainNodeTreeItem[],
): Record<string, string> {
  const names: Record<string, string> = {}

  for (const node of nodes) {
    names[node.id] = node.name
    Object.assign(names, flattenDomainNodeNames(node.children))
  }

  return names
}
