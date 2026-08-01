import { useState } from 'react'
import type {
  DomainPrioritySuggestion,
  DomainSupersessionSuggestion,
  DomainTopicSuggestion,
} from '@post-anki/shared'

import { resolveSuggestionStatus, triggerPriorityReview } from './domain-map.api'
import {
  resolveDocScanSupersessionSuggestion,
  resolveDocScanTopicSuggestion,
  runDocScan,
} from './domain-map.api'
import { useResolvingSuggestions } from './use-resolving-suggestions'

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
  initialNewTopicSuggestions,
  initialSupersessionSuggestions,
}: {
  subjectId: string
  nodeNamesById: Record<string, string>
  initialSuggestions: DomainPrioritySuggestion[]
  initialDue: boolean
  initialNewTopicSuggestions: DomainTopicSuggestion[]
  initialSupersessionSuggestions: DomainSupersessionSuggestion[]
}) {
  const [suggestions, setSuggestions] = useState(initialSuggestions)
  const [due, setDue] = useState(initialDue)
  const [triggering, setTriggering] = useState(false)
  const [triggerError, setTriggerError] = useState<string | null>(null)
  const [confirmation, setConfirmation] = useState<string | null>(null)

  // doc-changelog-scan (issue #49) state below.
  const [newTopicSuggestions, setNewTopicSuggestions] = useState(initialNewTopicSuggestions)
  const [supersessionSuggestions, setSupersessionSuggestions] = useState(
    initialSupersessionSuggestions,
  )
  const [scanning, setScanning] = useState(false)
  const [scanRanOnce, setScanRanOnce] = useState(false)
  const [docScanConfirmation, setDocScanConfirmation] = useState<string | null>(null)

  const { claim, release, isResolving } = useResolvingSuggestions()

  async function scanNow() {
    if (scanning) {
      return
    }

    setScanning(true)

    try {
      const result = await runDocScan({ data: subjectId })
      setNewTopicSuggestions((prev) => [...result.newTopicSuggestions, ...prev])
      setSupersessionSuggestions((prev) => [...result.supersessionSuggestions, ...prev])
    } catch {
      // Silent-fallback posture (spec.md's Decisions #8): a failed scan
      // reads identically to "nothing changed" — the sections simply stay
      // as they were, no error state.
    } finally {
      setScanning(false)
      setScanRanOnce(true)
    }
  }

  async function resolveNewTopic(suggestion: DomainTopicSuggestion, decision: 'accept' | 'reject') {
    if (!claim(suggestion.id)) {
      return
    }

    const status = decision === 'accept' ? 'accepted' : 'rejected'

    try {
      await resolveDocScanTopicSuggestion({ data: { suggestionId: suggestion.id, status } })

      setNewTopicSuggestions((prev) => prev.filter((item) => item.id !== suggestion.id))

      if (decision === 'accept') {
        const parentName = suggestion.proposedParentNodeId
          ? (nodeNamesById[suggestion.proposedParentNodeId] ?? suggestion.proposedParentNodeId)
          : 'the subject root'
        setDocScanConfirmation(`${suggestion.proposedNodeName} added under ${parentName}`)
        setTimeout(() => setDocScanConfirmation(null), 4000)
      }
    } catch {
      // The row deliberately stays in the list on failure so the decision can
      // be retried; `release` below re-enables its buttons.
    } finally {
      release(suggestion.id)
    }
  }

  async function resolveSupersession(
    suggestion: DomainSupersessionSuggestion,
    decision: 'accept' | 'reject',
  ) {
    if (!claim(suggestion.id)) {
      return
    }

    const status = decision === 'accept' ? 'accepted' : 'rejected'

    try {
      await resolveDocScanSupersessionSuggestion({ data: { suggestionId: suggestion.id, status } })

      setSupersessionSuggestions((prev) => prev.filter((item) => item.id !== suggestion.id))
    } catch {
      // Same retry posture as resolveNewTopic above.
    } finally {
      release(suggestion.id)
    }
  }

  async function trigger() {
    if (triggering) {
      return
    }

    setTriggering(true)
    setTriggerError(null)

    try {
      const fresh = await triggerPriorityReview({ data: subjectId })
      setSuggestions((prev) => [...fresh, ...prev])

      // Only clear the banner when the review actually produced something.
      // The server's own due-status comes from MAX(created_at) over inserted
      // rows, so predicting due:false on an empty result desyncs the two until
      // the next page load.
      if (fresh.length > 0) {
        setDue(false)
      }
    } catch {
      setTriggerError('Review could not be completed — try again.')
    } finally {
      setTriggering(false)
    }
  }

  async function resolve(suggestion: DomainPrioritySuggestion, decision: 'accept' | 'reject') {
    if (!claim(suggestion.id)) {
      return
    }

    const status = decision === 'accept' ? 'accepted' : 'rejected'

    try {
      await resolveSuggestionStatus({
        data: { suggestionId: suggestion.id, status },
      })

      setSuggestions((prev) => prev.filter((item) => item.id !== suggestion.id))

      if (decision === 'accept') {
        const name = nodeNamesById[suggestion.domainNodeId] ?? suggestion.domainNodeId
        setConfirmation(`Applied to ${name}`)
        setTimeout(() => setConfirmation(null), 4000)
      }
    } catch {
      // Same retry posture as the doc-scan resolvers above.
    } finally {
      release(suggestion.id)
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
                  disabled={isResolving(suggestion.id)}
                  onClick={() => resolve(suggestion, 'accept')}
                  className="rounded-md bg-neutral-900 px-3 py-1 text-xs font-medium text-white disabled:opacity-50"
                >
                  Accept
                </button>
                <button
                  type="button"
                  data-testid={`priority-review-suggestion-reject-${suggestion.id}`}
                  disabled={isResolving(suggestion.id)}
                  onClick={() => resolve(suggestion, 'reject')}
                  className="rounded-md border border-neutral-300 px-3 py-1 text-xs text-neutral-600 disabled:opacity-50"
                >
                  Reject
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}

      <div data-testid="doc-scan-section" className="border-t border-neutral-200 pt-4">
        <div className="flex items-center gap-3">
          <button
            type="button"
            data-testid="doc-scan-trigger-button"
            disabled={scanning}
            onClick={scanNow}
            className="rounded-md bg-neutral-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
          >
            {scanning ? 'Scanning…' : 'Scan now'}
          </button>
          {docScanConfirmation ? (
            <span className="text-sm text-emerald-700">{docScanConfirmation}</span>
          ) : null}
        </div>

        <div className="mt-3">
          <h2 className="text-sm font-semibold text-neutral-700">New topics found</h2>
          {newTopicSuggestions.length === 0 ? (
            <p className="mt-1 text-sm text-neutral-500">
              {scanRanOnce ? 'No new suggestions this scan.' : 'No pending suggestions.'}
            </p>
          ) : (
            <ul className="mt-2 space-y-2">
              {newTopicSuggestions.map((suggestion) => (
                <li
                  key={suggestion.id}
                  data-testid={`doc-scan-new-topic-${suggestion.id}`}
                  className="rounded-lg border border-neutral-200 bg-white p-3"
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-sm font-medium">{suggestion.proposedNodeName}</span>
                    <span className="text-xs text-neutral-500">
                      under{' '}
                      {suggestion.proposedParentNodeId
                        ? (nodeNamesById[suggestion.proposedParentNodeId] ??
                          suggestion.proposedParentNodeId)
                        : 'subject root'}
                    </span>
                  </div>

                  <p
                    data-testid={`doc-scan-new-topic-reason-${suggestion.id}`}
                    className="mt-1 text-xs text-neutral-600"
                  >
                    {suggestion.reason}
                  </p>

                  <span
                    data-testid={`doc-scan-new-topic-source-${suggestion.id}`}
                    className="mt-1 inline-block text-[11px] text-neutral-400"
                  >
                    {suggestion.source}
                  </span>

                  <div className="mt-2 flex gap-2">
                    <button
                      type="button"
                      data-testid={`doc-scan-new-topic-accept-${suggestion.id}`}
                      disabled={isResolving(suggestion.id)}
                      onClick={() => resolveNewTopic(suggestion, 'accept')}
                      className="rounded-md bg-neutral-900 px-3 py-1 text-xs font-medium text-white disabled:opacity-50"
                    >
                      Accept
                    </button>
                    <button
                      type="button"
                      data-testid={`doc-scan-new-topic-reject-${suggestion.id}`}
                      disabled={isResolving(suggestion.id)}
                      onClick={() => resolveNewTopic(suggestion, 'reject')}
                      className="rounded-md border border-neutral-300 px-3 py-1 text-xs text-neutral-600 disabled:opacity-50"
                    >
                      Reject
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="mt-4">
          <h2 className="text-sm font-semibold text-neutral-700">Possibly outdated</h2>
          {supersessionSuggestions.length === 0 ? (
            <p className="mt-1 text-sm text-neutral-500">
              {scanRanOnce ? 'No new suggestions this scan.' : 'No pending suggestions.'}
            </p>
          ) : (
            <ul className="mt-2 space-y-2">
              {supersessionSuggestions.map((suggestion) => (
                <li
                  key={suggestion.id}
                  data-testid={`doc-scan-supersession-${suggestion.id}`}
                  className="rounded-lg border border-neutral-200 bg-white p-3"
                >
                  <span className="text-sm font-medium">
                    {nodeNamesById[suggestion.domainNodeId] ?? suggestion.domainNodeId}
                  </span>

                  <p
                    data-testid={`doc-scan-supersession-reason-${suggestion.id}`}
                    className="mt-1 text-xs text-neutral-600"
                  >
                    {suggestion.reason}
                  </p>

                  <span
                    data-testid={`doc-scan-supersession-source-${suggestion.id}`}
                    className="mt-1 inline-block text-[11px] text-neutral-400"
                  >
                    {suggestion.source}
                  </span>

                  <div className="mt-2 flex gap-2">
                    <button
                      type="button"
                      data-testid={`doc-scan-supersession-accept-${suggestion.id}`}
                      disabled={isResolving(suggestion.id)}
                      onClick={() => resolveSupersession(suggestion, 'accept')}
                      className="rounded-md bg-neutral-900 px-3 py-1 text-xs font-medium text-white disabled:opacity-50"
                    >
                      Accept
                    </button>
                    <button
                      type="button"
                      data-testid={`doc-scan-supersession-reject-${suggestion.id}`}
                      disabled={isResolving(suggestion.id)}
                      onClick={() => resolveSupersession(suggestion, 'reject')}
                      className="rounded-md border border-neutral-300 px-3 py-1 text-xs text-neutral-600 disabled:opacity-50"
                    >
                      Reject
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  )
}
