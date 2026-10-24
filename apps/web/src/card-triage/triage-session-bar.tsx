import { Link } from '@tanstack/react-router'

import {
  PRIMARY_BUTTON_CLASS,
  SECONDARY_BUTTON_CLASS,
} from '../knowledge-bit/knowledge-bit-review-classes'
import type { TriageSession } from './use-triage-session'

export function TriageSessionBar({ session }: { session: TriageSession }) {
  if (!session.isOpen) {
    return (
      <div className="flex flex-wrap items-center gap-3" data-testid="triage-session-bar">
        <button
          type="button"
          data-testid="triage-start"
          disabled={session.busy}
          onClick={() => void session.start()}
          className={SECONDARY_BUTTON_CLASS}
        >
          Start triage
        </button>
        <span className="hidden text-xs text-neutral-600 sm:inline">Key: s</span>
        <Link to="/knowledge/style-notes" className="text-xs text-neutral-600 underline">
          Style notes
        </Link>
        {session.error ? (
          <p role="alert" className="text-xs text-red-700">
            {session.error}
          </p>
        ) : null}
      </div>
    )
  }

  return (
    <div
      data-testid="triage-session-bar"
      className="flex flex-wrap items-center gap-3 rounded-md bg-amber-50 px-3 py-2"
    >
      <span data-testid="triage-counts" role="status" className="text-sm font-medium">
        Triage: {session.decidedCount} decided ({session.acceptedCount} accepted,{' '}
        {session.rejectedCount} rejected)
      </span>
      {session.resumed ? (
        <span data-testid="triage-resumed" className="text-xs text-neutral-700">
          A triage session from earlier is still open. Decisions made before the reload are still counted. Finish it to save your feedback.
        </span>
      ) : null}
      <button
        type="button"
        data-testid="triage-finish"
        onClick={session.openFinish}
        className={PRIMARY_BUTTON_CLASS}
      >
        Finish triage
      </button>
      <span className="hidden text-xs text-neutral-600 sm:inline">Key: f</span>
    </div>
  )
}
