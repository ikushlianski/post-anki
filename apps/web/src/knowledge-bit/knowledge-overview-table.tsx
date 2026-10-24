import { useEffect, useRef } from 'react'
import type { KeyboardEvent } from 'react'
import type { KnowledgeBitOverviewItem } from '@post-anki/shared'

import { CardSourceLink } from './card-source-link'
import { KnowledgeBitChatPanel } from './knowledge-bit-chat-panel'
import { SECONDARY_BUTTON_CLASS } from './knowledge-bit-review-classes'

export interface OverviewFocusRequest {
  rowId: string | null
  nonce: number
}

export interface OverviewRowState {
  pending: boolean
  failed: boolean
}

export interface KnowledgeOverviewTableProps {
  rows: KnowledgeBitOverviewItem[]
  selected: ReadonlySet<string>
  cursorId: string | null
  focusRequest: OverviewFocusRequest | null
  rowStates: Record<string, OverviewRowState>
  subjectLabel: (subjectId: string | null) => string
  onKeyDown: (event: KeyboardEvent<HTMLElement>) => void
  onRowFocus: (id: string) => void
  onCheckboxClick: (id: string, shiftKey: boolean) => void
  onToggleSuspend: (item: KnowledgeBitOverviewItem) => void
}

const STATE_LABELS: Record<KnowledgeBitOverviewItem['state'], string> = {
  new: 'New',
  learning: 'Learning',
  review: 'Review',
  relearning: 'Relearning',
  suspended: 'Suspended',
  buried: 'Buried',
}

function formatDue(iso: string | null): string {
  return iso ? new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric' }) : ''
}

function isOverdue(iso: string | null): boolean {
  return iso ? new Date(iso) < new Date() : false
}

const CELL = 'px-3 py-2 align-top text-sm text-neutral-800'
const HEAD = 'px-3 py-2 text-left text-xs font-medium uppercase tracking-wide text-neutral-500'

export function KnowledgeOverviewTable({
  rows,
  selected,
  cursorId,
  focusRequest,
  rowStates,
  subjectLabel,
  onKeyDown,
  onRowFocus,
  onCheckboxClick,
  onToggleSuspend,
}: KnowledgeOverviewTableProps) {
  const rowRefs = useRef(new Map<string, HTMLTableRowElement>())
  const handledNonce = useRef(0)
  const tabbableId = rows.some((row) => row.knowledgeBitId === cursorId)
    ? cursorId
    : (rows[0]?.knowledgeBitId ?? null)

  useEffect(() => {
    if (!focusRequest || focusRequest.rowId === null || focusRequest.nonce === handledNonce.current) {
      return
    }

    const element = rowRefs.current.get(focusRequest.rowId)

    if (!element) {
      return
    }

    handledNonce.current = focusRequest.nonce
    element.focus()
  }, [focusRequest, rows])

  return (
    <table
      role="grid"
      aria-multiselectable="true"
      aria-label="Approved cards"
      data-testid="knowledge-overview-grid"
      onKeyDown={onKeyDown}
      className="w-full border-collapse"
    >
      <thead>
        <tr role="row" className="border-b border-neutral-200">
          <th role="columnheader" className={HEAD}>
            <span className="sr-only">Select</span>
          </th>
          <th role="columnheader" className={HEAD}>Question</th>
          <th role="columnheader" className={HEAD}>Answer</th>
          <th role="columnheader" className={HEAD}>Subject</th>
          <th role="columnheader" className={HEAD}>State</th>
          <th role="columnheader" className={HEAD}>
            <span className="sr-only">Actions</span>
          </th>
        </tr>
      </thead>
      <tbody>
        {rows.map((row) => {
          const id = row.knowledgeBitId
          const isSelected = selected.has(id)
          const rowState = rowStates[id]
          const due = formatDue(row.dueAt)

          return (
            <tr
              key={id}
              role="row"
              aria-selected={isSelected}
              tabIndex={id === tabbableId ? 0 : -1}
              data-testid={`knowledge-overview-row-${id}`}
              ref={(element) => {
                if (element) {
                  rowRefs.current.set(id, element)
                } else {
                  rowRefs.current.delete(id)
                }
              }}
              onFocus={(event) => {
                if (event.target === event.currentTarget) {
                  onRowFocus(id)
                }
              }}
              className={`border-b border-neutral-100 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-neutral-900 ${
                isSelected ? 'bg-violet-50' : 'bg-white'
              }`}
            >
              <td role="gridcell" className={CELL}>
                <input
                  type="checkbox"
                  tabIndex={-1}
                  checked={isSelected}
                  aria-label={`Select card: ${row.question}`}
                  data-testid={`knowledge-overview-check-${id}`}
                  onChange={() => undefined}
                  onClick={(event) => onCheckboxClick(id, event.shiftKey)}
                />
              </td>
              <td role="gridcell" className={`${CELL} font-medium text-neutral-900`}>{row.question}</td>
              <td role="gridcell" className={`${CELL} text-neutral-600`}>
                <span className="line-clamp-2">{row.answer}</span>
                <CardSourceLink sourceLinks={row.sourceLinks} testId={`knowledge-overview-source-${id}`} />
              </td>
              <td role="gridcell" className={CELL} data-testid={`knowledge-overview-subject-${id}`}>
                {subjectLabel(row.subjectId)}
              </td>
              <td role="gridcell" className={CELL} data-testid={`knowledge-overview-state-${id}`}>
                {STATE_LABELS[row.state]}
                {due ? <span className={`block text-xs ${isOverdue(row.dueAt) ? 'text-amber-600' : 'text-neutral-500'}`}>Due {due}</span> : null}
              </td>
              <td role="gridcell" className={CELL}>
                <button
                  type="button"
                  tabIndex={id === tabbableId ? 0 : -1}
                  disabled={rowState?.pending ?? false}
                  data-testid={`knowledge-overview-suspend-${id}`}
                  onClick={() => onToggleSuspend(row)}
                  className={SECONDARY_BUTTON_CLASS}
                >
                  {row.state === 'suspended' ? 'Unsuspend' : 'Suspend'}
                </button>
                <div className="mt-2 flex">
                  <KnowledgeBitChatPanel key={id} knowledgeBitId={id} />
                </div>
                {rowState?.failed ? (
                  <p role="alert" className="mt-1 text-xs text-red-700">
                    Could not update this card.
                  </p>
                ) : null}
              </td>
            </tr>
          )
        })}
      </tbody>
    </table>
  )
}
