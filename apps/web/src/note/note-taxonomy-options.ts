import type { DomainNodeTreeItem } from '@post-anki/shared'

export interface DomainNodeOption {
  id: string
  label: string
  depth: number
}

export function flattenDomainTree(
  nodes: DomainNodeTreeItem[],
  depth = 0,
): DomainNodeOption[] {
  const sorted = [...nodes].sort((a, b) => a.order - b.order)

  return sorted.flatMap((node) => [
    { id: node.id, label: node.name, depth },
    ...flattenDomainTree(node.children, depth + 1),
  ])
}

export function indentedLabel(option: DomainNodeOption): string {
  const prefix = Array.from({ length: option.depth }, () => '—').join(' ')

  return prefix === '' ? option.label : `${prefix} ${option.label}`
}
