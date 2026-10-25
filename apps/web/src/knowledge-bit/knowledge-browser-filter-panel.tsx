import type { KnowledgeBitBrowserFilters } from '@post-anki/shared'

import { KnowledgeBrowserColumnFilter } from './knowledge-browser-column-filter'
import type { BrowserFilterTarget, BrowserFiltersChange } from './knowledge-browser-column-filter'
import { BROWSER_COLUMN_LABELS } from './knowledge-browser-columns'
import { countActiveFilters } from './knowledge-browser-filters'
import { KnowledgeBrowserToolbarPopover } from './knowledge-browser-toolbar-popover'
import { SECONDARY_BUTTON_CLASS } from './knowledge-bit-review-classes'

const PANEL_SECTIONS: { target: BrowserFilterTarget; label: string }[] = [
  { target: 'phrasings', label: BROWSER_COLUMN_LABELS.phrasings },
  { target: 'answer', label: BROWSER_COLUMN_LABELS.answer },
  { target: 'source', label: BROWSER_COLUMN_LABELS.source },
  { target: 'addedBy', label: BROWSER_COLUMN_LABELS.addedBy },
  { target: 'sourceUrl', label: BROWSER_COLUMN_LABELS.sourceUrl },
  { target: 'addedAt', label: BROWSER_COLUMN_LABELS.addedAt },
  { target: 'state', label: 'Study state' },
]

export function KnowledgeBrowserFilterPanel({
  filters,
  onChange,
}: {
  filters: KnowledgeBitBrowserFilters
  onChange: BrowserFiltersChange
}) {
  const count = countActiveFilters(filters)

  return (
    <KnowledgeBrowserToolbarPopover
      buttonLabel="Filters"
      testId="knowledge-browser-filters-button"
      buttonClassName={SECONDARY_BUTTON_CLASS}
      placement="sheet"
      panelWidthClass="sm:w-96"
      buttonContent={<>Filters{count > 0 ? ` (${count})` : ''}</>}
    >
      <div className="flex flex-col gap-4">
        {PANEL_SECTIONS.map((section) => (
          <section key={section.target} data-testid={`filter-section-${section.target}`}>
            <h3 className="mb-1 text-xs font-medium uppercase text-neutral-500">{section.label}</h3>
            <KnowledgeBrowserColumnFilter column={section.target} filters={filters} onChange={onChange} />
          </section>
        ))}
      </div>
    </KnowledgeBrowserToolbarPopover>
  )
}
