import { useState } from 'react'
import { useRouter } from '@tanstack/react-router'
import type { SubjectDuplicateSuggestion } from '@post-anki/shared'

import type { Subject } from '../curriculum/model'
import { resolveDuplicateSuggestion, scanForDuplicates } from './subject-duplicate.api'

// ai-duplicate-detection (issue #63), SCENARIOS 1/2/4/5/6/7. Lives above the
// subject list on the home board — the only page with every subject in
// view (spec.md's Decisions #9) — following priority-review-panel.tsx's
// panel shape: a trigger button, a busy state, and inline accept/reject
// controls, no separate route.
export function DuplicateScanPanel({
  initialSuggestions,
  allSubjects,
}: {
  initialSuggestions: SubjectDuplicateSuggestion[]
  allSubjects: Subject[]
}) {
  const router = useRouter()
  const [suggestions, setSuggestions] = useState(initialSuggestions)
  const [scanning, setScanning] = useState(false)
  const [scanError, setScanError] = useState<string | null>(null)
  const [cappedNotice, setCappedNotice] = useState<string | null>(null)

  const nameById = Object.fromEntries(allSubjects.map((subject) => [subject.id, subject.name]))

  async function scan() {
    if (scanning) {
      return
    }

    setScanning(true)
    setScanError(null)

    try {
      const result = await scanForDuplicates()

      setSuggestions((prev) => {
        const existingIds = new Set(prev.map((s) => s.id))
        const fresh = result.suggestions.filter((s) => !existingIds.has(s.id))

        return [...fresh, ...prev]
      })

      // SCENARIO 7 — the response only tells us this run's embedded count
      // and whether the eligible pool exceeded the cap, not the total
      // backlog size, so the notice stays honest about what's known rather
      // than inventing an "X of Y" figure the schema doesn't carry.
      setCappedNotice(
        result.capped
          ? `Embedded ${result.embeddedCount} subjects this scan — more still need a refresh; run the scan again to continue.`
          : null,
      )
    } catch {
      // SCENARIO 6 — no-silent-fallback posture (mirrors
      // triggerDomainPriorityReview): a failed scan surfaces a clear error
      // state, never a false "no duplicates found".
      setScanError('Scan could not be completed — try again.')
    } finally {
      setScanning(false)
    }
  }

  function handleResolved(suggestionId: string) {
    setSuggestions((prev) => prev.filter((s) => s.id !== suggestionId))
    void router.invalidate()
  }

  return (
    <div data-testid="duplicate-scan-panel" className="mb-10 space-y-3">
      <div className="flex items-center gap-3">
        <button
          type="button"
          data-testid="duplicate-scan-trigger-button"
          disabled={scanning}
          onClick={scan}
          className="rounded-md bg-neutral-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
        >
          {scanning ? 'Scanning…' : 'Scan for duplicates'}
        </button>
      </div>

      {scanError ? (
        <p data-testid="duplicate-scan-error" className="text-sm text-red-600">
          {scanError}
        </p>
      ) : null}

      {cappedNotice ? (
        <p data-testid="duplicate-scan-capped-notice" className="text-xs text-amber-700">
          {cappedNotice}
        </p>
      ) : null}

      {suggestions.length > 0 ? (
        <ul className="space-y-2">
          {suggestions.map((suggestion) => (
            <DuplicateSuggestionCard
              key={suggestion.id}
              suggestion={suggestion}
              nameById={nameById}
              onResolved={handleResolved}
            />
          ))}
        </ul>
      ) : null}
    </div>
  )
}

function DuplicateSuggestionCard({
  suggestion,
  nameById,
  onResolved,
}: {
  suggestion: SubjectDuplicateSuggestion
  nameById: Record<string, string>
  onResolved: (suggestionId: string) => void
}) {
  const [armed, setArmed] = useState(false)
  const [busy, setBusy] = useState(false)
  const [targetSubjectId, setTargetSubjectId] = useState('')
  const [error, setError] = useState<string | null>(null)

  const nameA = nameById[suggestion.subjectAId] ?? suggestion.subjectAId
  const nameB = nameById[suggestion.subjectBId] ?? suggestion.subjectBId
  const similarityPercent = Math.round(suggestion.similarity * 100)

  async function confirmAccept() {
    if (!targetSubjectId) {
      return
    }

    setBusy(true)
    setError(null)

    try {
      await resolveDuplicateSuggestion({
        data: {
          suggestionId: suggestion.id,
          input: { status: 'accepted', targetSubjectId },
        },
      })
      onResolved(suggestion.id)
    } catch {
      // The backend is the real gate (mirrors MergeCurriculumButton's own
      // note): a target that failed to merge in the moment between opening
      // the picker and confirming shows a generic retry message rather than
      // depending on the server-fn error shape.
      setError("Couldn't merge — try again.")
      setBusy(false)
    }
  }

  async function reject() {
    setBusy(true)

    try {
      await resolveDuplicateSuggestion({
        data: { suggestionId: suggestion.id, input: { status: 'rejected' } },
      })
      onResolved(suggestion.id)
    } finally {
      setBusy(false)
    }
  }

  return (
    <li
      data-testid={`duplicate-suggestion-${suggestion.id}`}
      className="rounded-lg border border-neutral-200 bg-white p-3"
    >
      <p data-testid={`duplicate-suggestion-reason-${suggestion.id}`} className="text-sm">
        <span className="font-medium">{nameA}</span> and{' '}
        <span className="font-medium">{nameB}</span> might be the same subject (similarity{' '}
        {similarityPercent}%)
      </p>

      {!armed ? (
        <div className="mt-2 flex gap-2">
          <button
            type="button"
            data-testid={`duplicate-suggestion-accept-${suggestion.id}`}
            disabled={busy}
            onClick={() => setArmed(true)}
            className="rounded-md bg-neutral-900 px-3 py-1 text-xs font-medium text-white disabled:opacity-40"
          >
            Accept
          </button>
          <button
            type="button"
            data-testid={`duplicate-suggestion-reject-${suggestion.id}`}
            disabled={busy}
            onClick={reject}
            className="rounded-md border border-neutral-300 px-3 py-1 text-xs text-neutral-600 disabled:opacity-40"
          >
            Reject
          </button>
        </div>
      ) : (
        <div className="mt-2 flex flex-wrap items-center gap-2 text-xs">
          <span className="text-neutral-500">keep:</span>
          <select
            data-testid={`duplicate-suggestion-target-select-${suggestion.id}`}
            value={targetSubjectId}
            onChange={(event) => setTargetSubjectId(event.target.value)}
            className="rounded-md border border-neutral-200 px-1.5 py-0.5 text-xs"
          >
            <option value="">choose…</option>
            <option value={suggestion.subjectAId}>{nameA}</option>
            <option value={suggestion.subjectBId}>{nameB}</option>
          </select>
          <button
            type="button"
            disabled={busy || !targetSubjectId}
            data-testid={`duplicate-suggestion-confirm-${suggestion.id}`}
            onClick={confirmAccept}
            className="font-medium text-indigo-600 hover:text-indigo-700 disabled:opacity-40"
          >
            Confirm
          </button>
          <button
            type="button"
            data-testid={`duplicate-suggestion-cancel-${suggestion.id}`}
            onClick={() => setArmed(false)}
            className="text-neutral-400 hover:text-neutral-700"
          >
            cancel
          </button>
          {error ? (
            <span data-testid={`duplicate-suggestion-error-${suggestion.id}`} className="text-red-600">
              {error}
            </span>
          ) : null}
        </div>
      )}
    </li>
  )
}
