import type { KeyboardEvent } from 'react'
import type { KnowledgeBitOverviewItem } from '@post-anki/shared'

import { SearchableSelect } from '../ui/searchable-select'
import type { SearchableOption } from '../ui/searchable-select'
import { PRIMARY_BUTTON_CLASS, SECONDARY_BUTTON_CLASS, TEXT_FIELD_CLASS } from './knowledge-bit-review-classes'
import { KnowledgeOverviewDownload } from './knowledge-overview-download'
import { KnowledgeOverviewTable } from './knowledge-overview-table'
import type { OverviewFocusRequest, OverviewRowState } from './knowledge-overview-table'

interface OverviewSubjectFilterProps {
  options: SearchableOption[]
  value: string
  onChange: (id: string) => void
}

function OverviewSubjectFilter({ options, value, onChange }: OverviewSubjectFilterProps) {
  return (
    <SearchableSelect
      options={options}
      value={value}
      onChange={onChange}
      ariaLabel="Filter by subject"
      testId="knowledge-overview-subject-filter"
      placeholder="All subjects"
      emptyText="No subject matches"
      clearable
      maxRows={10}
      className={`${TEXT_FIELD_CLASS} cursor-pointer pr-9`}
      containerClassName="sm:w-72"
    />
  )
}

export interface KnowledgeOverviewPageProps {
  rows: KnowledgeBitOverviewItem[]
  subjectOptions: SearchableOption[]
  subjectId: string
  search: string
  selected: ReadonlySet<string>
  cursorId: string | null
  focusRequest: OverviewFocusRequest | null
  rowStates: Record<string, OverviewRowState>
  hasMore: boolean
  loadingMore: boolean
  subjectLabel: (subjectId: string | null) => string
  onSubjectChange: (subjectId: string) => void
  onSearchChange: (search: string) => void
  onKeyDown: (event: KeyboardEvent<HTMLElement>) => void
  onRowFocus: (id: string) => void
  onCheckboxClick: (id: string, shiftKey: boolean) => void
  onToggleSuspend: (item: KnowledgeBitOverviewItem) => void
  onDelete: () => void
  onMove: () => void
  onBulkSuspend: (suspended: boolean) => void
  onClear: () => void
  onLoadMore: () => void
}

export function KnowledgeOverviewPage(props: KnowledgeOverviewPageProps) {
  const { rows, selected } = props

  return (
    <main data-testid="knowledge-overview-page" className="mx-auto max-w-[110rem] px-5 py-8 sm:px-8 sm:py-10">
      <header className="mb-6">
        <h1 className="text-2xl font-semibold tracking-tight">All cards</h1>
        <p className="mt-1 text-sm text-neutral-500">
          Every approved card. Select with Space or Shift+Arrow, then press Delete to remove them.
        </p>
        <div className="mt-3">
          <KnowledgeOverviewDownload />
        </div>
      </header>

      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center">
        <OverviewSubjectFilter
          options={props.subjectOptions}
          value={props.subjectId}
          onChange={props.onSubjectChange}
        />
        <input
          type="search"
          aria-label="Search cards"
          placeholder="Search questions and answers"
          data-testid="knowledge-overview-search"
          value={props.search}
          onChange={(event) => props.onSearchChange(event.target.value)}
          className={`${TEXT_FIELD_CLASS} sm:w-96`}
        />
      </div>

      <div
          data-testid="knowledge-overview-selection-bar"
          className="mb-4 flex min-h-14 flex-wrap items-center gap-3 rounded-md border border-neutral-200 bg-neutral-50 px-3 py-2"
        >
          <span className="text-sm font-medium text-neutral-900">{selected.size > 0 ? `Selected ${selected.size}` : 'None selected'}</span>
          <button
            type="button"
            data-testid="knowledge-overview-delete"
            disabled={selected.size === 0}
            onClick={props.onDelete}
            className={PRIMARY_BUTTON_CLASS}
          >
            Delete
          </button>
          <button
            type="button"
            data-testid="knowledge-overview-move"
            disabled={selected.size === 0}
            onClick={props.onMove}
            className={SECONDARY_BUTTON_CLASS}
          >
            Move
          </button>
          <button
            type="button"
            data-testid="knowledge-overview-bulk-suspend"
            disabled={selected.size === 0}
            onClick={() => props.onBulkSuspend(true)}
            className={SECONDARY_BUTTON_CLASS}
          >
            Suspend
          </button>
          <button
            type="button"
            data-testid="knowledge-overview-bulk-unsuspend"
            disabled={selected.size === 0}
            onClick={() => props.onBulkSuspend(false)}
            className={SECONDARY_BUTTON_CLASS}
          >
            Unsuspend
          </button>
          <button
            type="button"
            data-testid="knowledge-overview-clear"
            disabled={selected.size === 0}
            onClick={props.onClear}
            className={SECONDARY_BUTTON_CLASS}
          >
            Clear
          </button>
      </div>

      {rows.length === 0 ? (
        <p data-testid="knowledge-overview-empty" className="text-neutral-500">
          No cards match.
        </p>
      ) : (
        <KnowledgeOverviewTable
          rows={rows}
          selected={selected}
          cursorId={props.cursorId}
          focusRequest={props.focusRequest}
          rowStates={props.rowStates}
          subjectLabel={props.subjectLabel}
          onKeyDown={props.onKeyDown}
          onRowFocus={props.onRowFocus}
          onCheckboxClick={props.onCheckboxClick}
          onToggleSuspend={props.onToggleSuspend}
        />
      )}

      {props.hasMore ? (
        <div className="mt-6 flex justify-center">
          <button
            type="button"
            data-testid="knowledge-overview-load-more"
            disabled={props.loadingMore}
            onClick={props.onLoadMore}
            className={SECONDARY_BUTTON_CLASS}
          >
            {props.loadingMore ? 'Loading…' : 'Load more'}
          </button>
        </div>
      ) : null}
    </main>
  )
}
