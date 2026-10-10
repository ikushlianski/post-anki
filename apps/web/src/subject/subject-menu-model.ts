import { buildSubjectPathLabel, listValidMoveTargets } from '@post-anki/core'

import type { Subject } from '../curriculum/model'

export const MOVE_FILTER_THRESHOLD = 8

export interface MoveOption {
  parentId: string
  name: string
  path: string
  depth: number
  isCurrent: boolean
}

export function buildMoveOptions(
  subjectId: string,
  currentParentId: string | null,
  allSubjects: Subject[],
): MoveOption[] {
  const targets = listValidMoveTargets(subjectId, allSubjects)
  const targetIds = new Set(targets.map((target) => target.id))
  const childrenOf = new Map<string | null, Subject[]>()

  for (const target of targets) {
    const key = target.parentId !== null && targetIds.has(target.parentId) ? target.parentId : null

    childrenOf.set(key, [...(childrenOf.get(key) ?? []), target])
  }

  const options: MoveOption[] = []
  const visited = new Set<string>()

  function visit(parentKey: string | null, depth: number) {
    const children = [...(childrenOf.get(parentKey) ?? [])].sort((a, b) =>
      a.name.localeCompare(b.name),
    )

    for (const child of children) {
      if (visited.has(child.id)) {
        continue
      }

      visited.add(child.id)
      options.push({
        parentId: child.id,
        name: child.name,
        path: buildSubjectPathLabel(child.id, allSubjects),
        depth,
        isCurrent: child.id === currentParentId,
      })
      visit(child.id, depth + 1)
    }
  }

  visit(null, 0)

  return options
}

export function filterMoveOptions(options: MoveOption[], query: string): MoveOption[] {
  const needle = query.trim().toLowerCase()

  if (needle === '') {
    return options
  }

  return options.filter((option) => option.path.toLowerCase().includes(needle))
}

export function countDirectSubSubjects(subjectId: string, allSubjects: Subject[]): number {
  return allSubjects.filter((subject) => subject.parentId === subjectId).length
}
