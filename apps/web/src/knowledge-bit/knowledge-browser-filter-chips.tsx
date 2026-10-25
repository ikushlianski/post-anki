import type { KnowledgeBitBrowserFilters } from '@post-anki/shared'

import { buildFilterChips, removeChip } from './knowledge-browser-filters'
import type { BrowserFilterChip } from './knowledge-browser-filters'
import type { BrowserFiltersChange } from './knowledge-browser-column-filter'

export function KnowledgeBrowserFilterChips({
  filters,
  total,
  onChange,
  onClearAll,
}: {
  filters: KnowledgeBitBrowserFilters
  total: number | null
  onChange: BrowserFiltersChange
  onClearAll: () => void
}) {
  const chips: BrowserFilterChip[] = buildFilterChips(filters)

  if (chips.length === 0) {
    return null
  }

  return (
    <div
      data-testid="knowledge-browser-chips"
      className="flex basis-full flex-nowrap items-center gap-2 overflow-x-auto whitespace-nowrap sm:flex-wrap sm:overflow-visible"
    >
      {total !== null && (
        <span data-testid="knowledge-browser-total" className="text-sm text-neutral-600">
          {total} matching {total === 1 ? 'piece' : 'pieces'}
        </span>
      )}
      {chips.map((chip) => (
        <button
          key={chip.key}
          type="button"
          aria-label={`Remove filter ${chip.label}`}
          data-testid={`knowledge-browser-chip-${chip.key}`}
          className="shrink-0 rounded-full bg-neutral-100 px-3 py-1 text-xs text-neutral-800 hover:bg-neutral-200"
          onClick={() => onChange(removeChip(filters, chip), 'push')}
        >
          {chip.label} ×
        </button>
      ))}
      <button
        type="button"
        data-testid="knowledge-browser-clear-all"
        className="shrink-0 text-xs text-neutral-600 underline"
        onClick={onClearAll}
      >
        Clear all
      </button>
    </div>
  )
}
