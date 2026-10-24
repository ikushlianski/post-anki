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
import type { BrowserColumnId, BrowserSourceCellActions } from './knowledge-browser-columns'
import { KnowledgeBrowserSortableHeader } from './knowledge-browser-sortable-header'

interface KnowledgeBrowserTableProps {
  rows: KnowledgeBitBrowserItem[]
  columnOrder: BrowserColumnId[]
  onColumnOrderChange: (order: BrowserColumnId[]) => void
  selected: ReadonlySet<string>
  onToggleRow: (id: string, shift: boolean) => void
  onToggleAll: () => void
  sourceActions?: BrowserSourceCellActions
}

export function KnowledgeBrowserTable({
  rows,
  columnOrder,
  onColumnOrderChange,
  selected,
  onToggleRow,
  onToggleAll,
  sourceActions,
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

  const allSelected = rows.length > 0 && rows.every((row) => selected.has(row.knowledgeBitId))

  return (
    <div className="overflow-x-auto rounded border border-neutral-200">
      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
        <table data-testid="knowledge-browser-table" className="w-full min-w-[40rem] text-sm">
          <thead className="bg-neutral-50">
            <tr>
              <th scope="col" className="w-8 px-3 py-2">
                <input
                  type="checkbox"
                  aria-label="Select all on this page"
                  data-testid="knowledge-browser-select-all"
                  checked={allSelected}
                  onChange={onToggleAll}
                />
              </th>
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
                aria-selected={selected.has(row.knowledgeBitId)}
                className={`border-t border-neutral-200 align-top ${selected.has(row.knowledgeBitId) ? 'bg-neutral-50' : ''}`}
              >
                <td className="px-3 py-2">
                  <input
                    type="checkbox"
                    aria-label="Select piece"
                    data-testid="knowledge-browser-select-row"
                    checked={selected.has(row.knowledgeBitId)}
                    onChange={() => undefined}
                    onClick={(event) => onToggleRow(row.knowledgeBitId, event.shiftKey)}
                  />
                </td>
                {columnOrder.map((id) => (
                  <td key={id} className="px-3 py-2">
                    {renderBrowserCell(id, row, sourceActions)}
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
