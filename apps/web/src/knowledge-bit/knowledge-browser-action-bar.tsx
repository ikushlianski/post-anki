import { BROWSER_SELECTION_CAP } from './knowledge-browser-selection'
import { PRIMARY_BUTTON_CLASS, SECONDARY_BUTTON_CLASS } from './knowledge-bit-review-classes'
import type { BrowserSelectionDelete } from './use-knowledge-browser-selection-delete'

export interface BrowserSourceBarActions {
  count: number
  onSelectAll: () => void
  onDelete: () => void
}

export function KnowledgeBrowserActionBar({
  state,
  source,
}: {
  state: BrowserSelectionDelete
  source?: BrowserSourceBarActions | null
}) {
  const noun = state.count === 1 ? 'piece' : 'pieces'

  return (
    <>
      <div
        data-testid="knowledge-browser-action-bar"
        className="flex basis-full flex-wrap items-center gap-2 sm:ml-auto sm:basis-auto"
      >
        <span data-testid="knowledge-browser-selected-count" className="text-sm font-medium">
          {state.count} selected
          {state.count >= BROWSER_SELECTION_CAP ? ` (limit ${BROWSER_SELECTION_CAP})` : ''}
        </span>
        {!state.confirming && (
          <>
            <button
              type="button"
              data-testid="knowledge-browser-delete"
              disabled={state.count === 0}
              className={`${PRIMARY_BUTTON_CLASS} disabled:opacity-40`}
              onClick={state.openConfirm}
            >
              Delete
            </button>
            {source && (
              <>
                <button
                  type="button"
                  data-testid="knowledge-browser-select-source"
                  className={SECONDARY_BUTTON_CLASS}
                  onClick={source.onSelectAll}
                >
                  Select all from this source
                </button>
                <button
                  type="button"
                  data-testid="knowledge-browser-delete-source"
                  className={SECONDARY_BUTTON_CLASS}
                  onClick={source.onDelete}
                >
                  Delete whole source ({source.count} {source.count === 1 ? 'piece' : 'pieces'})
                </button>
              </>
            )}
            <button
              type="button"
              data-testid="knowledge-browser-clear-selection"
              disabled={state.count === 0}
              className={`${SECONDARY_BUTTON_CLASS} disabled:opacity-40`}
              onClick={state.clear}
            >
              Clear selection
            </button>
          </>
        )}
      </div>
      {state.confirming && (
        <div
          role="alertdialog"
          aria-label="Confirm delete"
          className="flex basis-full flex-wrap items-center gap-2"
        >
          <span className="text-sm text-red-700">
            Delete {state.count} {noun} permanently? This cannot be undone.
          </span>
          <button
            type="button"
            data-testid="knowledge-browser-confirm-delete"
            disabled={state.busy}
            className={PRIMARY_BUTTON_CLASS}
            onClick={() => void state.confirm()}
          >
            {state.busy ? 'Deleting…' : `Yes, delete ${state.count}`}
          </button>
          <button
            type="button"
            data-testid="knowledge-browser-cancel-delete"
            disabled={state.busy}
            className={SECONDARY_BUTTON_CLASS}
            onClick={state.cancelConfirm}
          >
            Cancel
          </button>
        </div>
      )}
      {state.error && (
        <p
          role="alert"
          data-testid="knowledge-browser-delete-error"
          className="basis-full text-sm text-red-700"
        >
          {state.error}
        </p>
      )}
    </>
  )
}
