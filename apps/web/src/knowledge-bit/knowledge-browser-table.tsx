import {
  closestCenter,
  DndContext,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
} from '@dnd-kit/core'
import type { DragEndEvent } from '@dnd-kit/core'
import {
  horizontalListSortingStrategy,
  SortableContext,
  sortableKeyboardCoordinates,
} from '@dnd-kit/sortable'
import type { KnowledgeBitBrowserItem } from '@post-anki/shared'

import { moveColumn } from './column-order'
import { BROWSER_COLUMN_LABELS, renderBrowserCell } from './knowledge-browser-columns'
import type { BrowserColumnId } from './knowledge-browser-columns'
import { KnowledgeBrowserSortableHeader } from './knowledge-browser-sortable-header'

interface KnowledgeBrowserTableProps {
  rows: KnowledgeBitBrowserItem[]
  columnOrder: BrowserColumnId[]
  onColumnOrderChange: (order: BrowserColumnId[]) => void
}

export function KnowledgeBrowserTable({
  rows,
  columnOrder,
  onColumnOrderChange,
}: KnowledgeBrowserTableProps) {
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  )

  function handleDragEnd(event: DragEndEvent) {
    if (!event.over) return

    const next = moveColumn(columnOrder, String(event.active.id), String(event.over.id))

    if (next.some((id, index) => id !== columnOrder[index])) {
      onColumnOrderChange(next as BrowserColumnId[])
    }
  }

  return (
    <div className="overflow-x-auto rounded border border-neutral-200">
      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
        <table data-testid="knowledge-browser-table" className="w-full min-w-[40rem] text-sm">
          <thead className="bg-neutral-50">
            <tr>
              <SortableContext items={columnOrder} strategy={horizontalListSortingStrategy}>
                {columnOrder.map((id) => (
                  <KnowledgeBrowserSortableHeader key={id} id={id} label={BROWSER_COLUMN_LABELS[id]} />
                ))}
              </SortableContext>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr
                key={row.knowledgeBitId}
                data-testid="knowledge-browser-row"
                className="border-t border-neutral-200 align-top"
              >
                {columnOrder.map((id) => (
                  <td key={id} className="px-3 py-2">
                    {renderBrowserCell(id, row)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </DndContext>
    </div>
  )
}
