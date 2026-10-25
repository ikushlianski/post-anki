import type { ReactNode } from 'react'
import type { KnowledgeBitBrowserFilters } from '@post-anki/shared'

import { KnowledgeBrowserActionBar } from './knowledge-browser-action-bar'
import type { BrowserSourceBarActions } from './knowledge-browser-action-bar'
import type { BrowserFiltersChange } from './knowledge-browser-column-filter'
import { KnowledgeBrowserColumnsMenu } from './knowledge-browser-columns-menu'
import { KnowledgeBrowserFilterChips } from './knowledge-browser-filter-chips'
import { KnowledgeBrowserFilterPanel } from './knowledge-browser-filter-panel'
import { KnowledgeBrowserSourceBar } from './knowledge-browser-source-bar'
import { KnowledgeBrowserSubjectPicker } from './knowledge-browser-subject-picker'
import type { SubjectPickerOption } from './knowledge-browser-subject-picker'
import type { BrowserColumns } from './use-knowledge-browser-column-order'
import type { BrowserSelectionDelete } from './use-knowledge-browser-selection-delete'
import type { BrowserSourceDelete } from './use-knowledge-browser-source-delete'

export function unselectedNote(count: number): string {
  return `${count} selected ${count === 1 ? 'piece is' : 'pieces are'} hidden by the filters and ${count === 1 ? 'was' : 'were'} unselected`
}

export interface KnowledgeBrowserToolbarProps {
  searchSlot?: ReactNode
  subjectId: string | null
  subjectOptions: readonly SubjectPickerOption[]
  onSubjectChange: (subjectId: string | null) => void
  filters: KnowledgeBitBrowserFilters
  onFiltersChange: BrowserFiltersChange
  onClearAll: () => void
  total: number | null
  columns: BrowserColumns
  selection: BrowserSelectionDelete
  sourceDelete: BrowserSourceDelete
  activeSource: BrowserSourceBarActions | null
}

export function KnowledgeBrowserToolbar({
  searchSlot,
  subjectId,
  subjectOptions,
  onSubjectChange,
  filters,
  onFiltersChange,
  onClearAll,
  total,
  columns,
  selection,
  sourceDelete,
  activeSource,
}: KnowledgeBrowserToolbarProps) {
  return (
    <div
      data-testid="knowledge-browser-toolbar"
      className="sticky top-0 z-30 mb-3 flex flex-wrap items-center gap-2 rounded border border-neutral-300 bg-white px-3 py-2 shadow-sm"
    >
      <div
        data-testid="knowledge-browser-search-slot"
        className="min-w-0 basis-full sm:basis-64 sm:flex-1"
      >
        {searchSlot}
      </div>
      <div className="flex basis-full flex-wrap items-center gap-2 sm:basis-auto">
        <KnowledgeBrowserSubjectPicker
          subjectId={subjectId}
          options={subjectOptions}
          onChange={onSubjectChange}
        />
        <KnowledgeBrowserFilterPanel filters={filters} onChange={onFiltersChange} />
        <KnowledgeBrowserColumnsMenu
          allColumns={columns.allColumns}
          hidden={columns.hidden}
          isDefault={columns.isDefault}
          onToggle={columns.toggle}
          onReset={columns.reset}
        />
      </div>
      <KnowledgeBrowserActionBar state={selection} source={activeSource} />
      <KnowledgeBrowserSourceBar state={sourceDelete} />
      {selection.unselectedCount > 0 && (
        <p
          role="status"
          data-testid="knowledge-browser-unselected-note"
          className="basis-full text-sm text-neutral-600"
        >
          {unselectedNote(selection.unselectedCount)}
        </p>
      )}
      <KnowledgeBrowserFilterChips
        filters={filters}
        total={total}
        onChange={onFiltersChange}
        onClearAll={onClearAll}
      />
    </div>
  )
}
