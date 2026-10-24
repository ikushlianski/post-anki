import { useSortable } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'

interface KnowledgeBrowserSortableHeaderProps {
  id: string
  label: string
}

export function KnowledgeBrowserSortableHeader({ id, label }: KnowledgeBrowserSortableHeaderProps) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id })

  return (
    <th
      ref={setNodeRef}
      data-testid={`browser-column-${id}`}
      scope="col"
      style={{ transform: CSS.Translate.toString(transform), transition }}
      className={`px-3 py-2 text-left font-medium text-neutral-600 ${isDragging ? 'relative z-10 bg-neutral-100' : ''}`}
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
      </span>
    </th>
  )
}
