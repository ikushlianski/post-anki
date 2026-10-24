import { useState } from 'react'
import type { SubjectSuggestion, TriggerSubjectSuggestionScanResult } from '@post-anki/shared'

import type { Subject } from '../curriculum/model'
import {
  resolveSubjectSuggestion,
  runSubjectSuggestionScan,
  listPendingSubjectSuggestions,
} from './subject-suggestion.api'
import { SubjectSuggestionRow } from './subject-suggestion-row'

function describeScan(result: TriggerSubjectSuggestionScanResult): string {
  if (result.budgetStopped) {
    return `Budget reached — scan stopped early. ${result.created} new suggestions added.`
  }

  return `Scan finished: ${result.created} new suggestions, ${result.skipped} skipped.`
}

export function SubjectSuggestionPanel({
  initialSuggestions,
  allSubjects,
}: {
  initialSuggestions: SubjectSuggestion[]
  allSubjects: Subject[]
}) {
  const [suggestions, setSuggestions] = useState(initialSuggestions)
  const [scanning, setScanning] = useState(false)
  const [scanMessage, setScanMessage] = useState<string | null>(null)
  const [scanError, setScanError] = useState<string | null>(null)

  const nameById = Object.fromEntries(allSubjects.map((subject) => [subject.id, subject.name]))

  async function scan() {
    if (scanning) {
      return
    }

    setScanning(true)
    setScanError(null)
    setScanMessage(null)

    try {
      const result = await runSubjectSuggestionScan()

      setScanMessage(describeScan(result))
      setSuggestions(await listPendingSubjectSuggestions({ data: 'pending' }))
    } catch {
      setScanError('Scan could not be completed — try again.')
    } finally {
      setScanning(false)
    }
  }

  function remove(id: string) {
    setSuggestions((prev) => prev.filter((s) => s.id !== id))
  }

  return (
    <section data-testid="subject-suggestion-panel" className="mb-10 space-y-3">
      <h2 className="text-lg font-semibold tracking-tight">Suggested subjects</h2>
      <p className="text-sm text-neutral-500">
        Subjects and sub-subjects the app thinks your saved knowledge needs. Nothing is created
        until you approve it.
      </p>

      <button
        type="button"
        data-testid="subject-suggestion-scan-button"
        disabled={scanning}
        onClick={scan}
        className="rounded-md bg-neutral-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
      >
        {scanning ? 'Scanning…' : 'Run scan'}
      </button>

      {scanMessage ? (
        <p data-testid="subject-suggestion-scan-message" className="text-xs text-neutral-600">
          {scanMessage}
        </p>
      ) : null}

      {scanError ? (
        <p data-testid="subject-suggestion-scan-error" className="text-sm text-red-600">
          {scanError}
        </p>
      ) : null}

      {suggestions.length === 0 ? (
        <p data-testid="subject-suggestion-empty" className="text-sm text-neutral-500">
          No suggestions right now.
        </p>
      ) : (
        <ul className="space-y-2">
          {suggestions.map((suggestion) => (
            <SubjectSuggestionRow
              key={suggestion.id}
              suggestion={suggestion}
              parentName={
                suggestion.parentSubjectId
                  ? (nameById[suggestion.parentSubjectId] ?? 'Unknown subject')
                  : null
              }
              resolve={resolveSubjectSuggestion}
              onResolved={remove}
            />
          ))}
        </ul>
      )}
    </section>
  )
}
