import { useState } from 'react'
import type { DomainPrioritySuggestion } from '@post-anki/shared'

import { resolveSuggestionStatus, triggerPriorityReview } from './domain-map.api'

const DEPTH_LABEL: Record<string, string> = {
  awareness: 'Awareness',
  working: 'Working',
  deep: 'Deep',
}

function depthLabel(depth: string | null): string {
  return depth ? (DEPTH_LABEL[depth] ?? depth) : 'unset'
}

// domain-priority-review (issue #52), SCENARIOS 5/6/7/9. Every suggestion is
// visibly labeled as general-knowledge reasoning, not grounded in real
// trend data (spec.md's Decisions #12) — an honest baseline that makes #49
// (doc-scan) and #53 (job-market-scan) landing later a visible upgrade
// rather than a silent one.
export function PriorityReviewPanel({
  subjectId,
  nodeNamesById,
  initialSuggestions,
  initialDue,
}: {
  subjectId: string
  nodeNamesById: Record<string, string>
  initialSuggestions: DomainPrioritySuggestion[]
  initialDue: boolean
}) {
  const [suggestions, setSuggestions] = useState(initialSuggestions)
  const [due, setDue] = useState(initialDue)
  const [triggering, setTriggering] = useState(false)
  const [triggerError, setTriggerError] = useState<string | null>(null)
  const [confirmation, setConfirmation] = useState<string | null>(null)

  async function trigger() {
    if (triggering) {
      return
    }

    setTriggering(true)
    setTriggerError(null)

    try {
      const fresh = await triggerPriorityReview({ data: subjectId })
      setSuggestions((prev) => [...fresh, ...prev])
      setDue(false)
    } catch {
      setTriggerError('Review could not be completed — try again.')
    } finally {
      setTriggering(false)
    }
  }

  async function resolve(suggestion: DomainPrioritySuggestion, decision: 'accept' | 'reject') {
    const status = decision === 'accept' ? 'accepted' : 'rejected'

    await resolveSuggestionStatus({
      data: { suggestionId: suggestion.id, status },
    })

    setSuggestions((prev) => prev.filter((item) => item.id !== suggestion.id))

    if (decision === 'accept') {
      const name = nodeNamesById[suggestion.domainNodeId] ?? suggestion.domainNodeId
      setConfirmation(`Applied to ${name}`)
      setTimeout(() => setConfirmation(null), 4000)
    }
  }

  return (
    <div data-testid="priority-review-panel" className="space-y-4">
      {due ? (
        <div
          data-testid="priority-review-due-banner"
          className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800"
        >
          This subject's priorities haven't been reviewed in over 30 days.
        </div>
      ) : null}

      <div className="flex items-center gap-3">
        <button
          type="button"
          data-testid="priority-review-trigger-button"
          disabled={triggering}
          onClick={trigger}
          className="rounded-md bg-neutral-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
        >
          {triggering ? 'Reviewing…' : 'Trigger review'}
        </button>
        {confirmation ? <span className="text-sm text-emerald-700">{confirmation}</span> : null}
      </div>

      {triggerError ? (
        <p data-testid="priority-review-trigger-error" className="text-sm text-red-600">
          {triggerError}
        </p>
      ) : null}

      {suggestions.length === 0 ? (
        <p className="text-sm text-neutral-500">No pending suggestions.</p>
      ) : (
        <ul className="space-y-2">
          {suggestions.map((suggestion) => (
            <li
              key={suggestion.id}
              data-testid={`priority-review-suggestion-${suggestion.id}`}
              className="rounded-lg border border-neutral-200 bg-white p-3"
            >
              <div className="flex items-center justify-between gap-2">
                <span className="text-sm font-medium">
                  {nodeNamesById[suggestion.domainNodeId] ?? suggestion.domainNodeId}
                </span>
                <span className="text-xs text-neutral-500">
                  {depthLabel(suggestion.currentTargetDepth)} → {depthLabel(suggestion.suggestedTargetDepth)}
                </span>
              </div>

              <p
                data-testid={`priority-review-suggestion-reason-${suggestion.id}`}
                className="mt-1 text-xs text-neutral-600"
              >
                {suggestion.reason}
              </p>

              <span
                data-testid={`priority-review-suggestion-source-${suggestion.id}`}
                className="mt-1 inline-block text-[11px] text-neutral-400"
              >
                {suggestion.source === 'general-knowledge'
                  ? 'general knowledge — not grounded in real trend data'
                  : suggestion.source}
              </span>

              <div className="mt-2 flex gap-2">
                <button
                  type="button"
                  data-testid={`priority-review-suggestion-accept-${suggestion.id}`}
                  onClick={() => resolve(suggestion, 'accept')}
                  className="rounded-md bg-neutral-900 px-3 py-1 text-xs font-medium text-white"
                >
                  Accept
                </button>
                <button
                  type="button"
                  data-testid={`priority-review-suggestion-reject-${suggestion.id}`}
                  onClick={() => resolve(suggestion, 'reject')}
                  className="rounded-md border border-neutral-300 px-3 py-1 text-xs text-neutral-600"
                >
                  Reject
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
