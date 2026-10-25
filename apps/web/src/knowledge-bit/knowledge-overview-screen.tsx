import { KnowledgeBitReviewAnnouncer, useReviewAnnouncer } from './knowledge-bit-review-announcer'
import { CardListLoadError } from './card-list-load-error'
import { KnowledgeOverviewDeleteDialog } from './knowledge-overview-delete-dialog'
import { KnowledgeOverviewMoveDialog } from './knowledge-overview-move-dialog'
import { KnowledgeOverviewDownload } from './knowledge-overview-download'
import { KnowledgeOverviewPage } from './knowledge-overview-page'
import { useKnowledgeOverviewData } from './use-knowledge-overview-data'
import { useKnowledgeOverviewDelete } from './use-knowledge-overview-delete'
import { useKnowledgeOverviewMove } from './use-knowledge-overview-move'
import { useKnowledgeOverviewRowActions } from './use-knowledge-overview-row-actions'
import { useKnowledgeOverviewSelection } from './use-knowledge-overview-selection'
import { useKnowledgeOverviewSubjects } from './use-knowledge-overview-subjects'

export function KnowledgeOverviewScreen() {
  const { announcement, announce } = useReviewAnnouncer()
  const data = useKnowledgeOverviewData()
  const subjects = useKnowledgeOverviewSubjects()
  const rowIds = data.rows.map((row) => row.knowledgeBitId)
  const rowActions = useKnowledgeOverviewRowActions({ announce, onUpdated: data.refresh })

  let openDelete = () => {}
  let openMove = () => {}

  const selection = useKnowledgeOverviewSelection({
    rowIds,
    announce,
    onDeleteRequested: () => openDelete(),
    onMoveRequested: () => openMove(),
  })

  const deletion = useKnowledgeOverviewDelete({
    rowIds,
    selectedIds: selection.selectedIds,
    cursorId: selection.selection.cursor,
    announce,
    requestFocus: selection.requestFocus,
    onRemoved: (removed) => {
      data.removeRows(removed)
      data.refresh()
    },
  })

  const move = useKnowledgeOverviewMove({
    selectedIds: selection.selectedIds,
    cursorId: selection.selection.cursor,
    announce,
    onMoved: (moved) => {
      data.removeRows(moved)
      data.refresh()
    },
  })

  openDelete = deletion.open
  openMove = move.open

  if (data.isPending) {
    return (
      <main className="mx-auto max-w-[110rem] px-5 py-8 sm:px-8 sm:py-10">
        <h1 className="sr-only">All cards</h1>
        <p data-testid="knowledge-overview-loading" className="text-neutral-500">
          Loading…
        </p>
      </main>
    )
  }

  if (data.isError) {
    return (
      <main className="mx-auto max-w-[110rem] px-5 py-8 sm:px-8 sm:py-10">
        <h1 className="sr-only">All cards</h1>
        <div className="mb-6">
          <KnowledgeOverviewDownload />
        </div>
        <CardListLoadError
          testId="knowledge-overview-error"
          retryTestId="knowledge-overview-retry"
          onRetry={data.retry}
        />
      </main>
    )
  }

  return (
    <>
      <KnowledgeOverviewPage
        rows={data.rows}
        subjectOptions={subjects.options}
        subjectId={data.subjectId}
        search={data.search}
        selected={selection.selection.selected}
        cursorId={selection.selection.cursor}
        focusRequest={selection.focusRequest}
        rowStates={rowActions.rowStates}
        hasMore={data.hasMore}
        loadingMore={data.loadingMore}
        subjectLabel={subjects.labelFor}
        onSubjectChange={data.setSubjectId}
        onSearchChange={data.setSearch}
        onKeyDown={selection.handleKeyDown}
        onRowFocus={selection.handleRowFocus}
        onCheckboxClick={selection.handleCheckboxClick}
        onToggleSuspend={rowActions.toggleSuspend}
        onDelete={deletion.open}
        onMove={move.open}
        onBulkSuspend={(suspended) => rowActions.setSuspendedMany(selection.selectedIds, suspended)}
        onClear={selection.clear}
        onLoadMore={data.loadMore}
      />
      {deletion.isOpen ? (
        <KnowledgeOverviewDeleteDialog
          count={deletion.targetCount}
          busy={deletion.busy}
          error={deletion.error}
          onConfirm={() => void deletion.confirm()}
          onCancel={deletion.cancel}
        />
      ) : null}
      {move.isOpen ? (
        <KnowledgeOverviewMoveDialog
          count={move.targetCount}
          subjectOptions={subjects.options}
          busy={move.busy}
          error={move.error}
          onConfirm={(subjectId) => void move.confirm(subjectId)}
          onCancel={move.cancel}
        />
      ) : null}
      <KnowledgeBitReviewAnnouncer announcement={announcement} />
    </>
  )
}
