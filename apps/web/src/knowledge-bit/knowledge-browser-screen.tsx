import { useMemo, useRef } from 'react'
import type { ReactNode } from 'react'
import { Link } from '@tanstack/react-router'
import type { KnowledgeBitBrowserFilters, KnowledgeBitBrowserItem } from '@post-anki/shared'

import { CardListLoadError } from './card-list-load-error'
import { KnowledgeBrowserColumnFilter } from './knowledge-browser-column-filter'
import type { BrowserFiltersChange } from './knowledge-browser-column-filter'
import { filteredColumns, hasAnyFilter } from './knowledge-browser-filters'
import { KnowledgeBrowserDetailPanel } from './knowledge-browser-detail-panel'
import { KnowledgeBrowserMeaningSearch } from './knowledge-browser-meaning-search'
import { BROWSER_ROW_SELECTOR } from './knowledge-browser-slide-over'
import { KnowledgeBrowserToolbar } from './knowledge-browser-toolbar'
import { NO_SUBJECT_PARAM } from './knowledge-browser-subject-list'
import { idsFromSource, singleSelectedSource } from './knowledge-browser-source'
import { KnowledgeBrowserTable } from './knowledge-browser-table'
import { AddKnowledgeButton } from '../knowledge-source/add-knowledge-button'
import { useKnowledgeBrowserArrowKeys } from './use-knowledge-browser-arrow-keys'
import { useKnowledgeBrowserColumnOrder } from './use-knowledge-browser-column-order'
import { useKnowledgeBrowserRows } from './use-knowledge-browser-data'
import { useKnowledgeBrowserMatches } from './use-knowledge-browser-matches'
import { useKnowledgeBrowserSelectionDelete } from './use-knowledge-browser-selection-delete'
import { useKnowledgeBrowserSourceDelete } from './use-knowledge-browser-source-delete'
import { useKnowledgeOverviewSubjects } from './use-knowledge-overview-subjects'

export function BrowserShell({ children }: { children: ReactNode }) {
  return <main className="w-full px-5 py-8 sm:px-8 sm:py-10">{children}</main>
}

export const ALL_SUBJECTS_TABLE_ID = 'all-subjects'

export interface KnowledgeBrowserScreenProps {
  subjectId: string | null
  filters?: KnowledgeBitBrowserFilters
  onFiltersChange?: BrowserFiltersChange
  onSubjectChange?: (subjectId: string | null) => void
  onClearAll?: () => void
  openId?: string | null
  onOpenChange?: (id: string | null) => void
  meaningWords?: string
  onMeaningWordsChange?: (words: string | undefined) => void
}

const NO_FILTERS: KnowledgeBitBrowserFilters = {}

export function KnowledgeBrowserScreen(props: KnowledgeBrowserScreenProps) {
  return <KnowledgeBrowserCardTable {...props} />
}

function KnowledgeBrowserCardTable({
  subjectId,
  filters = NO_FILTERS,
  onFiltersChange = () => undefined,
  onSubjectChange = () => undefined,
  onClearAll = () => undefined,
  openId = null,
  onOpenChange = () => undefined,
  meaningWords,
  onMeaningWordsChange = () => undefined,
}: KnowledgeBrowserScreenProps) {
  const { labelFor, options } = useKnowledgeOverviewSubjects()
  const data = useKnowledgeBrowserRows(subjectId, filters)
  const matches = useKnowledgeBrowserMatches(meaningWords, subjectId, filters)
  const meaning = matches.active
  const rows = meaning ? matches.rows : data.rows
  const selection = useKnowledgeBrowserSelectionDelete(rows.map((row) => row.knowledgeBitId))
  const rowIds = useMemo(() => rows.map((row) => row.knowledgeBitId), [rows])

  useKnowledgeBrowserArrowKeys(rowIds, openId, onOpenChange)

  const lastOpenRow = useRef<KnowledgeBitBrowserItem | null>(null)
  const listedOpenRow = openId ? rows.find((row) => row.knowledgeBitId === openId) : undefined

  if (listedOpenRow) {
    lastOpenRow.current = listedOpenRow
  }

  const openRow = listedOpenRow ?? (lastOpenRow.current?.knowledgeBitId === openId ? lastOpenRow.current : null)
  const sourceDelete = useKnowledgeBrowserSourceDelete(rows, selection.clear)
  const activeSource = singleSelectedSource(rows, selection.selected)
  const columns = useKnowledgeBrowserColumnOrder(subjectId ?? ALL_SUBJECTS_TABLE_ID)
  const filtered = filteredColumns(filters)
  const filtering = hasAnyFilter(filters)
  const title = !subjectId
    ? 'Knowledge browser'
    : subjectId === NO_SUBJECT_PARAM
      ? 'No subject'
      : labelFor(subjectId) || 'Subject'

  return (
    <BrowserShell>
      {subjectId && (
        <Link
          to="/subjects"
          className="text-sm text-neutral-600 underline"
        >
          All subjects
        </Link>
      )}
      <div className="mb-6 mt-2 flex items-baseline justify-between gap-4">
        <h1 className="text-2xl font-semibold">{title}</h1>
        <div className="flex items-center gap-4">
          <AddKnowledgeButton
            subjectId={subjectId && subjectId !== NO_SUBJECT_PARAM ? subjectId : undefined}
          />
        </div>
      </div>
      <KnowledgeBrowserToolbar
        searchSlot={
          <KnowledgeBrowserMeaningSearch
            words={meaningWords}
            matches={matches}
            onSearch={onMeaningWordsChange}
          />
        }
        subjectId={subjectId}
        subjectOptions={options}
        onSubjectChange={onSubjectChange}
        filters={filters}
        onFiltersChange={onFiltersChange}
        onClearAll={onClearAll}
        total={data.total}
        columns={columns}
        selection={selection}
        sourceDelete={sourceDelete}
        activeSource={
          activeSource
            ? {
                count: sourceDelete.countFor(activeSource),
                onSelectAll: () => selection.addRows(idsFromSource(rows, activeSource)),
                onDelete: () => sourceDelete.open(activeSource),
              }
            : null
        }
      />
      {!meaning && data.isPending && (
        <p data-testid="knowledge-browser-loading" className="text-neutral-500">
          Loading…
        </p>
      )}
      {!meaning && data.isError && (
        <CardListLoadError
          testId="knowledge-browser-error"
          retryTestId="knowledge-browser-retry"
          onRetry={data.retry}
        />
      )}
      {!meaning && !data.isPending && !data.isError && data.rows.length === 0 && filtering && (
        <p data-testid="knowledge-browser-no-match" className="text-neutral-500">
          No pieces match these filters.{' '}
          <button
            type="button"
            data-testid="knowledge-browser-no-match-clear"
            className="underline"
            onClick={onClearAll}
          >
            Clear all
          </button>
        </p>
      )}
      {!meaning && !data.isPending && !data.isError && data.rows.length === 0 && !filtering && (
        <p data-testid="knowledge-browser-empty" className="text-neutral-500">
          {subjectId ? 'Nothing in this subject yet.' : 'No approved knowledge yet.'}
        </p>
      )}
      {rows.length > 0 && (
        <KnowledgeBrowserTable
          rows={rows}
          columnOrder={columns.order}
          onColumnOrderChange={columns.changeOrder}
          selected={selection.selected}
          openId={openId}
          onOpenRow={onOpenChange}
          onToggleRow={selection.toggleRow}
          onToggleAll={selection.toggleAll}
          sourceActions={{ countFor: sourceDelete.countFor, onDeleteSource: sourceDelete.open }}
          columnFilters={{
            isFiltered: (id) => filtered.has(id),
            renderEditor: (id) => (
              <KnowledgeBrowserColumnFilter column={id} filters={filters} onChange={onFiltersChange} />
            ),
          }}
        />
      )}
      {!meaning && data.hasMore && (
        <button
          type="button"
          data-testid="knowledge-browser-load-more"
          disabled={data.loadingMore}
          className="mt-4 rounded border border-neutral-300 px-4 py-2 text-sm"
          onClick={data.loadMore}
        >
          {data.loadingMore ? 'Loading…' : 'Load more'}
        </button>
      )}
      {openId && (
        <KnowledgeBrowserDetailPanel
          id={openId}
          row={openRow}
          onClose={() => onOpenChange(null)}
          getReturnFocus={() => findRowElement(openId)}
        />
      )}
    </BrowserShell>
  )
}

function findRowElement(id: string): HTMLElement | null {
  const rowElements = Array.from(document.querySelectorAll<HTMLElement>(BROWSER_ROW_SELECTOR))

  return rowElements.find((element) => element.dataset.rowId === id) ?? null
}
