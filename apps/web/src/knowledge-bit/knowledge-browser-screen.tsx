import type { ReactNode } from 'react'
import { Link } from '@tanstack/react-router'

import { CardListLoadError } from './card-list-load-error'
import { KnowledgeBrowserSubjectList, NO_SUBJECT_PARAM } from './knowledge-browser-subject-list'
import { KnowledgeBrowserTable } from './knowledge-browser-table'
import { useKnowledgeBrowserColumnOrder } from './use-knowledge-browser-column-order'
import { useKnowledgeBrowserRows } from './use-knowledge-browser-data'
import { useKnowledgeOverviewSubjects } from './use-knowledge-overview-subjects'

function BrowserShell({ children }: { children: ReactNode }) {
  return <main className="mx-auto max-w-6xl px-5 py-8 sm:px-8 sm:py-10">{children}</main>
}

export const ALL_SUBJECTS_TABLE_ID = 'all-subjects'

export function KnowledgeBrowserScreen({
  subjectId,
  view,
}: {
  subjectId: string | null
  view?: 'subjects'
}) {
  if (!subjectId && view === 'subjects') {
    return (
      <BrowserShell>
        <div className="mb-6 flex items-baseline justify-between gap-4">
          <h1 className="text-2xl font-semibold">Subjects</h1>
          <Link to="/knowledge" className="text-sm text-neutral-600 underline">
            Manage cards
          </Link>
        </div>
        <KnowledgeBrowserSubjectList />
      </BrowserShell>
    )
  }

  return <KnowledgeBrowserCardTable subjectId={subjectId} />
}

function KnowledgeBrowserCardTable({ subjectId }: { subjectId: string | null }) {
  const { labelFor } = useKnowledgeOverviewSubjects()
  const data = useKnowledgeBrowserRows(subjectId)
  const columns = useKnowledgeBrowserColumnOrder(subjectId ?? ALL_SUBJECTS_TABLE_ID)
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
        <button
          type="button"
          data-testid="knowledge-browser-reset-columns"
          disabled={columns.isDefault}
          className="text-sm text-neutral-600 underline disabled:no-underline disabled:opacity-40"
          onClick={columns.reset}
        >
          Reset column order
        </button>
      </div>
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
      {!data.isPending && !data.isError && data.rows.length === 0 && (
        <p data-testid="knowledge-browser-empty" className="text-neutral-500">
          {subjectId ? 'Nothing in this subject yet.' : 'No approved knowledge yet.'}
        </p>
      )}
      {data.rows.length > 0 && (
        <KnowledgeBrowserTable
          rows={data.rows}
          columnOrder={columns.order}
          onColumnOrderChange={columns.changeOrder}
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
