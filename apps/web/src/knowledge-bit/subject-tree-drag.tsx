import { useState } from 'react'
import type { ReactNode } from 'react'
import {
  DndContext,
  KeyboardSensor,
  PointerSensor,
  useDraggable,
  useDroppable,
  useDndContext,
  useSensor,
  useSensors,
} from '@dnd-kit/core'
import type { DragEndEvent } from '@dnd-kit/core'

import { updateSubjectParent } from '../subject/subject.api'

const ROOT_DROP_ID = 'subject-tree-root'

export interface SubjectDragNode {
  id: string
  children: SubjectDragNode[]
}

function collectParents(nodes: SubjectDragNode[], parent: string | null, into: Map<string, string | null>) {
  for (const node of nodes) {
    into.set(node.id, parent)
    collectParents(node.children, node.id, into)
  }
}

function descendantIds(nodes: SubjectDragNode[], id: string): Set<string> {
  const found = new Set<string>()

  function visit(list: SubjectDragNode[], inside: boolean) {
    for (const node of list) {
      const here = inside || node.id === id

      if (here && node.id !== id) {
        found.add(node.id)
      }

      visit(node.children, here)
    }
  }

  visit(nodes, false)

  return found
}

export function resolveSubjectMove(
  nodes: SubjectDragNode[],
  subjectId: string,
  targetId: string,
): { parentId: string | null } | null {
  const parents = new Map<string, string | null>()

  collectParents(nodes, null, parents)

  if (!parents.has(subjectId)) {
    return null
  }

  const parentId = targetId === ROOT_DROP_ID ? null : targetId

  if (parentId !== null && (parentId === subjectId || descendantIds(nodes, subjectId).has(parentId))) {
    return null
  }

  if (parentId !== null && !parents.has(parentId)) {
    return null
  }

  return parents.get(subjectId) === parentId ? null : { parentId }
}

export function SubjectDragProvider({ nodes, children }: { nodes: SubjectDragNode[]; children: ReactNode }) {
  const [error, setError] = useState<string | null>(null)
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor),
  )

  async function onDragEnd(event: DragEndEvent) {
    if (!event.over) {
      return
    }

    const move = resolveSubjectMove(nodes, String(event.active.id), String(event.over.id))

    if (!move) {
      return
    }

    try {
      await updateSubjectParent({ data: { subjectId: String(event.active.id), parentId: move.parentId } })
      setError(null)
    } catch {
      setError('Could not move that subject. Try again.')
    }
  }

  return (
    <DndContext sensors={sensors} onDragEnd={(event) => void onDragEnd(event)}>
      <RootDropZone />
      {error ? (
        <p role="alert" data-testid="subject-tree-move-error" className="mb-2 text-sm text-red-600">
          {error}
        </p>
      ) : null}
      {children}
    </DndContext>
  )
}

function RootDropZone() {
  const { active } = useDndContext()
  const { setNodeRef, isOver } = useDroppable({ id: ROOT_DROP_ID })

  if (!active) {
    return null
  }

  return (
    <div
      ref={setNodeRef}
      data-testid="subject-tree-root-drop"
      className={`mb-2 rounded border border-dashed px-3 py-2 text-sm ${
        isOver ? 'border-neutral-900 bg-neutral-100 text-neutral-900' : 'border-neutral-300 text-neutral-500'
      }`}
    >
      Drop here to make it a top-level subject
    </div>
  )
}

export function useSubjectDragRow(id: string) {
  const drag = useDraggable({ id })
  const drop = useDroppable({ id })

  return {
    rowRef: drop.setNodeRef,
    handleRef: drag.setNodeRef,
    handleProps: { ...drag.attributes, ...drag.listeners },
    isDragging: drag.isDragging,
    isOver: drop.isOver && !drag.isDragging,
  }
}
