import { useState } from 'react'
import type { CSSProperties, ReactNode } from 'react'
import {
  closestCenter,
  DndContext,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
} from '@dnd-kit/core'
import type { DragEndEvent, DraggableAttributes } from '@dnd-kit/core'
import {
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'

import type { Subject } from '../curriculum/model'
import { reorderAfterDrag } from '../curriculum/curriculum-drag-order'
import { reorderSubjects } from '../subject/subject.api'

export interface SortableRowHandle {
  rowRef: (element: HTMLElement | null) => void
  rowStyle: CSSProperties
  attributes: DraggableAttributes
  listeners: ReturnType<typeof useSortable>['listeners']
  isDragging: boolean
}

export interface SortableSubjectGroupProps {
  parentId: string | null
  siblings: Subject[]
  renderRow: (subject: Subject, handle: SortableRowHandle) => ReactNode
  onOrderSaved?: () => void
}

// Remount key: the group keeps its local order until the sibling set itself changes.
export function siblingSetKey(siblings: Subject[]): string {
  return siblings
    .map((subject) => subject.id)
    .sort()
    .join('|')
}

// Changes whenever the incoming order or any sort_order changes, so the group can re-sync.
function siblingOrderKey(siblings: Subject[]): string {
  return siblings.map((subject) => `${subject.id}:${subject.sortOrder ?? ''}`).join('|')
}

export function SortableSubjectGroup({
  parentId,
  siblings,
  renderRow,
  onOrderSaved,
}: SortableSubjectGroupProps) {
  const orderKey = siblingOrderKey(siblings)
  const [localOrder, setLocalOrder] = useState<string[]>(() => siblings.map((s) => s.id))
  const [syncedKey, setSyncedKey] = useState(orderKey)
  const [isBusy, setIsBusy] = useState(false)
  const [reorderError, setReorderError] = useState<string | null>(null)

  // Adopt incoming order changes, but not during a drag or a pending save: that would
  // overwrite the optimistic order. A change deferred this way applies once the group is idle.
  if (orderKey !== syncedKey && !isBusy) {
    setSyncedKey(orderKey)
    setLocalOrder(siblings.map((subject) => subject.id))
  }

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: { distance: 8 },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    }),
  )

  const byId = new Map(siblings.map((subject) => [subject.id, subject]))
  const ordered = localOrder.flatMap((id) => {
    const subject = byId.get(id)

    return subject ? [subject] : []
  })

  function handleDragStart() {
    setIsBusy(true)
  }

  function handleDragCancel() {
    setIsBusy(false)
  }

  async function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event
    const currentOrder = localOrder
    const nextOrder = over
      ? reorderAfterDrag(currentOrder, String(active.id), String(over.id))
      : currentOrder

    if (nextOrder === currentOrder) {
      setIsBusy(false)
      return
    }

    setLocalOrder(nextOrder)
    setReorderError(null)

    try {
      await reorderSubjects({ data: { parentId, orderedIds: nextOrder } })
      onOrderSaved?.()
    } catch (error) {
      setLocalOrder(currentOrder)
      setReorderError(error instanceof Error ? error.message : 'Failed to reorder subjects')
    } finally {
      setIsBusy(false)
    }
  }

  return (
    <div>
      <DndContext
        id={`subject-sortable-group-${parentId ?? 'root'}`}
        sensors={sensors}
        collisionDetection={closestCenter}
        onDragStart={handleDragStart}
        onDragCancel={handleDragCancel}
        onDragEnd={handleDragEnd}
      >
        <SortableContext items={localOrder} strategy={verticalListSortingStrategy}>
          <ul className="space-y-2">
            {ordered.map((subject) => (
              <SortableRow key={subject.id} subject={subject} renderRow={renderRow} />
            ))}
          </ul>
        </SortableContext>
      </DndContext>
      {reorderError ? (
        <div role="alert" data-testid="reorder-error" className="mt-2 text-sm text-red-600">
          {reorderError}
        </div>
      ) : null}
    </div>
  )
}

function SortableRow({
  subject,
  renderRow,
}: {
  subject: Subject
  renderRow: SortableSubjectGroupProps['renderRow']
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: subject.id,
    data: { type: 'subject' },
  })

  return (
    <>
      {renderRow(subject, {
        rowRef: setNodeRef,
        rowStyle: { transform: CSS.Transform.toString(transform), transition },
        attributes,
        listeners,
        isDragging,
      })}
    </>
  )
}
