import type { ReactNode } from 'react'
import { Link } from '@tanstack/react-router'
import type { KnowledgeBitBrowserFilters } from '@post-anki/shared'

import { CardListLoadError } from './card-list-load-error'
import { KnowledgeBrowserColumnFilter } from './knowledge-browser-column-filter'
import type { BrowserFiltersChange } from './knowledge-browser-column-filter'
import { filteredColumns, hasAnyFilter } from './knowledge-browser-filters'
import { KnowledgeBrowserToolbar } from './knowledge-browser-toolbar'
import { KnowledgeBrowserSubjectList, NO_SUBJECT_PARAM } from './knowledge-browser-subject-list'
import { idsFromSource, singleSelectedSource } from './knowledge-browser-source'
import { KnowledgeBrowserTable } from './knowledge-browser-table'
import { AddKnowledgeButton } from '../knowledge-source/add-knowledge-button'
import { useKnowledgeBrowserColumnOrder } from './use-knowledge-browser-column-order'
import { useKnowledgeBrowserRows } from './use-knowledge-browser-data'
import { useKnowledgeBrowserSelectionDelete } from './use-knowledge-browser-selection-delete'
import { useKnowledgeBrowserSourceDelete } from './use-knowledge-browser-source-delete'
import { useKnowledgeOverviewSubjects } from './use-knowledge-overview-subjects'

function BrowserShell({ children }: { children: ReactNode }) {
  return <main className="w-full px-5 py-8 sm:px-8 sm:py-10">{children}</main>
}

export const ALL_SUBJECTS_TABLE_ID = 'all-subjects'

export interface KnowledgeBrowserScreenProps {
  subjectId: string | null
  view?: 'subjects'
  filters?: KnowledgeBitBrowserFilters
  onFiltersChange?: BrowserFiltersChange
  onSubjectChange?: (subjectId: string | null) => void
  onClearAll?: () => void
}

const NO_FILTERS: KnowledgeBitBrowserFilters = {}

export function KnowledgeBrowserScreen({ subjectId, view, ...controls }: KnowledgeBrowserScreenProps) {
  if (!subjectId && view === 'subjects') {
    return (
      <BrowserShell>
        <div className="mb-6 flex items-baseline justify-between gap-4">
          <h1 className="text-2xl font-semibold">Subjects</h1>
          <div className="flex items-center gap-4">
            <Link to="/knowledge" className="text-sm text-neutral-600 underline">
              Manage cards
            </Link>
            <AddKnowledgeButton />
          </div>
        </div>
        <KnowledgeBrowserSubjectList />
      </BrowserShell>
    )
  }

  return <KnowledgeBrowserCardTable subjectId={subjectId} {...controls} />
}

function KnowledgeBrowserCardTable({
  subjectId,
  filters = NO_FILTERS,
  onFiltersChange = () => undefined,
  onSubjectChange = () => undefined,
  onClearAll = () => undefined,
}: Omit<KnowledgeBrowserScreenProps, 'view'>) {
  const { labelFor, options } = useKnowledgeOverviewSubjects()
  const data = useKnowledgeBrowserRows(subjectId, filters)
  const selection = useKnowledgeBrowserSelectionDelete(data.rows.map((row) => row.knowledgeBitId))
  const sourceDelete = useKnowledgeBrowserSourceDelete(data.rows, selection.clear)
  const activeSource = singleSelectedSource(data.rows, selection.selected)
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
          to="/knowledge/browser"
          search={{ view: 'subjects' }}
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
                onSelectAll: () => selection.addRows(idsFromSource(data.rows, activeSource)),
                onDelete: () => sourceDelete.open(activeSource),
              }
            : null
        }
      />
      {data.isPending && (
        <p data-testid="knowledge-browser-loading" className="text-neutral-500">
          Loading…
        </p>
      )}
      {data.isError && (
        <CardListLoadError
          testId="knowledge-browser-error"
          retryTestId="knowledge-browser-retry"
          onRetry={data.retry}
        />
      )}
      {!data.isPending && !data.isError && data.rows.length === 0 && filtering && (
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
      {!data.isPending && !data.isError && data.rows.length === 0 && !filtering && (
        <p data-testid="knowledge-browser-empty" className="text-neutral-500">
          {subjectId ? 'Nothing in this subject yet.' : 'No approved knowledge yet.'}
        </p>
      )}
      {data.rows.length > 0 && (
        <KnowledgeBrowserTable
          rows={data.rows}
          columnOrder={columns.order}
          onColumnOrderChange={columns.changeOrder}
          selected={selection.selected}
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
      {data.hasMore && (
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
    </BrowserShell>
  )
}
