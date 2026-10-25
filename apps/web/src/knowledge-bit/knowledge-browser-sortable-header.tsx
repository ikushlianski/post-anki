import { useSortable } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import type { ReactNode } from 'react'

import { ColumnResizeHandle } from '../ui/column-resize-handle'
import { KnowledgeBrowserToolbarPopover } from './knowledge-browser-toolbar-popover'

interface KnowledgeBrowserSortableHeaderProps {
  id: string
  label: string
  filterEditor?: ReactNode
  filtered?: boolean
  width: number
  onResize: (width: number) => void
}

export function KnowledgeBrowserSortableHeader({
  id,
  label,
  filterEditor,
  filtered = false,
  onResize,
  width,
}: KnowledgeBrowserSortableHeaderProps) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id })

  return (
    <th
      ref={setNodeRef}
      data-testid={`browser-column-${id}`}
      scope="col"
      style={{ transform: CSS.Translate.toString(transform), transition }}
      className={`relative px-3 py-2 text-left font-medium text-neutral-600 ${isDragging ? 'relative z-10 bg-neutral-100' : ''}`}
    >
      <span className="flex items-center gap-2">
        <button
          type="button"
          aria-label={`Move column ${label}`}
          data-testid={`browser-column-grip-${id}`}
          className="cursor-grab touch-none rounded px-1 text-neutral-400 hover:bg-neutral-100 hover:text-neutral-700"
          {...attributes}
          {...listeners}
        >
          ⋮⋮
        </button>
        {label}
        {filterEditor && (
          <KnowledgeBrowserToolbarPopover
            buttonLabel={`Filter ${label}`}
            testId={`browser-column-filter-${id}`}
            placement="fixed"
            panelWidthClass="w-64"
            buttonClassName={`relative rounded px-1 text-xs hover:bg-neutral-100 ${filtered ? 'text-neutral-900' : 'text-neutral-400 hover:text-neutral-700'}`}
            buttonContent={
              <>
                ▾
                {filtered && (
                  <span
                    data-testid={`browser-column-filtered-${id}`}
                    aria-label="Filtered"
                    className="absolute -right-0.5 -top-0.5 h-1.5 w-1.5 rounded-full bg-blue-600"
                  />
                )}
              </>
            }
          >
            {filterEditor}
          </KnowledgeBrowserToolbarPopover>
        )}
      </span>
      <ColumnResizeHandle
        label={label}
        width={width}
        onResize={onResize}
        testId={`browser-column-resize-${id}`}
      />
    </th>
  )
}
