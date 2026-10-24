import type { KnowledgeBitBrowserItem } from '@post-anki/shared'

import type { BrowserSourceCellActions } from './knowledge-browser-columns'

export function KnowledgeBrowserOriginCell({
  label,
  item,
  actions,
}: {
  label: string
  item: KnowledgeBitBrowserItem
  actions?: BrowserSourceCellActions
}) {
  const sourceId = item.sourceId ?? null

  if (!sourceId) {
    return <>{label}</>
  }

  const count = actions?.countFor(sourceId) ?? 0

  return (
    <div className="flex items-center gap-2 overflow-hidden whitespace-nowrap">
      <span>{label}</span>
      {item.sourceLabel && (
        <span data-testid="knowledge-browser-source-label" className="truncate text-neutral-500" title={item.sourceLabel}>
          {item.sourceLabel}
        </span>
      )}
      {actions && (
        <button
          type="button"
          data-testid="knowledge-browser-row-delete-source"
          className="shrink-0 text-xs text-red-700 underline"
          onClick={() => actions.onDeleteSource(sourceId)}
        >
          Delete whole source ({count} {count === 1 ? 'piece' : 'pieces'})
        </button>
      )}
    </div>
  )
}
