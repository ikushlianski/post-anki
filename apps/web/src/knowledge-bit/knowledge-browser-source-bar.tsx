import { PRIMARY_BUTTON_CLASS, SECONDARY_BUTTON_CLASS } from './knowledge-bit-review-classes'
import type { BrowserSourceDelete } from './use-knowledge-browser-source-delete'

export function KnowledgeBrowserSourceBar({ state }: { state: BrowserSourceDelete }) {
  if (!state.sourceId) {
    return null
  }

  const noun = state.count === 1 ? 'piece' : 'pieces'
  const name = state.label ? ` "${state.label}"` : ''

  return (
    <div
      role="alertdialog"
      aria-label="Confirm delete source"
      data-testid="knowledge-browser-source-bar"
      className="flex basis-full flex-wrap items-center gap-2 rounded border border-red-300 px-3 py-2"
    >
      <span className="text-sm text-red-700">
        Delete the whole source{name} and its {state.count} {noun}? This cannot be undone.
        {state.hiddenCount > 0 &&
          ` ${state.hiddenCount} of them ${state.hiddenCount === 1 ? 'is' : 'are'} hidden by the filters or not loaded yet.`}
      </span>
      <button
        type="button"
        data-testid="knowledge-browser-source-confirm"
        disabled={state.busy}
        className={PRIMARY_BUTTON_CLASS}
        onClick={() => void state.confirm()}
      >
        {state.busy ? 'Deleting…' : `Yes, delete ${state.count} ${noun}`}
      </button>
      <button
        type="button"
        data-testid="knowledge-browser-source-cancel"
        disabled={state.busy}
        className={SECONDARY_BUTTON_CLASS}
        onClick={state.cancel}
      >
        Cancel
      </button>
      {state.error && (
        <p role="alert" data-testid="knowledge-browser-source-error" className="text-sm text-red-700">
          {state.error}
        </p>
      )}
    </div>
  )
}
