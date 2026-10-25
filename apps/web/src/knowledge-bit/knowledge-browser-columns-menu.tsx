import { BROWSER_COLUMN_LABELS } from './knowledge-browser-columns'
import type { BrowserColumnId } from './knowledge-browser-columns'
import { KnowledgeBrowserToolbarPopover } from './knowledge-browser-toolbar-popover'
import { SECONDARY_BUTTON_CLASS } from './knowledge-bit-review-classes'

export function KnowledgeBrowserColumnsMenu({
  allColumns,
  hidden,
  isDefault,
  onToggle,
  onReset,
}: {
  allColumns: readonly BrowserColumnId[]
  hidden: readonly BrowserColumnId[]
  isDefault: boolean
  onToggle: (id: BrowserColumnId) => void
  onReset: () => void
}) {
  const onlyOneLeft = allColumns.length - hidden.length <= 1

  return (
    <KnowledgeBrowserToolbarPopover
      buttonLabel="Columns"
      testId="knowledge-browser-columns-button"
      buttonClassName={SECONDARY_BUTTON_CLASS}
      panelWidthClass="w-56"
      buttonContent="Columns"
    >
      <ul className="flex flex-col gap-1">
        {allColumns.map((id) => {
          const shown = !hidden.includes(id)

          return (
            <li key={id}>
              <label className="flex min-h-8 items-center gap-2">
                <input
                  type="checkbox"
                  data-testid={`columns-toggle-${id}`}
                  checked={shown}
                  disabled={shown && onlyOneLeft}
                  onChange={() => onToggle(id)}
                />
                {BROWSER_COLUMN_LABELS[id]}
              </label>
            </li>
          )
        })}
      </ul>
      <button
        type="button"
        data-testid="knowledge-browser-reset-columns"
        disabled={isDefault}
        className="mt-3 text-xs text-neutral-600 underline disabled:no-underline disabled:opacity-40"
        onClick={onReset}
      >
        Reset columns
      </button>
    </KnowledgeBrowserToolbarPopover>
  )
}
