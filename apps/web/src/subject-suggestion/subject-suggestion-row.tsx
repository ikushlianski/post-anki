import { useState } from 'react'
import type { ResolveSubjectSuggestionInput, SubjectSuggestion } from '@post-anki/shared'

import type { ResolveSubjectSuggestionResult } from '../curriculum/api-client'

type ResolveFn = (args: {
  data: { suggestionId: string; input: ResolveSubjectSuggestionInput }
}) => Promise<ResolveSubjectSuggestionResult>

export function SubjectSuggestionRow({
  suggestion,
  parentName,
  resolve,
  onResolved,
}: {
  suggestion: SubjectSuggestion
  parentName: string | null
  resolve: ResolveFn
  onResolved: (id: string) => void
}) {
  const [editing, setEditing] = useState(false)
  const [name, setName] = useState(suggestion.proposedName)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const trimmed = name.trim()
  const nameValid = trimmed.length >= 2 && trimmed.length <= 60

  async function send(input: ResolveSubjectSuggestionInput) {
    setBusy(true)
    setError(null)

    try {
      const result = await resolve({ data: { suggestionId: suggestion.id, input } })

      if (result.outcome === 'name_taken') {
        setError('A subject with this name already exists here — edit the name and try again.')
        setEditing(true)

        return
      }

      onResolved(suggestion.id)
    } catch {
      setError("Couldn't save — try again.")
    } finally {
      setBusy(false)
    }
  }

  function approve() {
    void send({
      action: 'approve',
      ...(trimmed !== suggestion.proposedName ? { name: trimmed } : {}),
    })
  }

  return (
    <li
      data-testid={`subject-suggestion-${suggestion.id}`}
      className="rounded-lg border border-neutral-200 bg-white p-3"
    >
      <div className="flex flex-wrap items-center gap-2 text-xs">
        <span
          data-testid={`subject-suggestion-kind-${suggestion.id}`}
          className="rounded bg-neutral-100 px-1.5 py-0.5 text-neutral-600"
        >
          {suggestion.kind === 'new-subject' ? 'New subject' : 'Split into parts'}
        </span>
        {parentName ? <span className="text-neutral-500">inside {parentName}</span> : null}
      </div>

      {editing ? (
        <input
          aria-label="Subject name"
          data-testid={`subject-suggestion-name-input-${suggestion.id}`}
          value={name}
          maxLength={60}
          onChange={(event) => setName(event.target.value)}
          className="mt-2 w-full rounded-md border border-neutral-300 px-2 py-1 text-sm"
        />
      ) : (
        <p data-testid={`subject-suggestion-name-${suggestion.id}`} className="mt-2 text-sm font-medium">
          {name}
        </p>
      )}

      <p className="mt-1 text-sm text-neutral-600">{suggestion.reason}</p>
      <p className="mt-1 text-xs text-neutral-500">
        Based on {suggestion.evidenceCount} saved items
      </p>
      {suggestion.evidenceSamples.length > 0 ? (
        <ul className="mt-1 list-disc pl-5 text-xs text-neutral-500">
          {suggestion.evidenceSamples.map((sample) => (
            <li key={sample}>{sample}</li>
          ))}
        </ul>
      ) : null}

      <div className="mt-2 flex items-center gap-2">
        <button
          type="button"
          data-testid={`subject-suggestion-approve-${suggestion.id}`}
          disabled={busy || !nameValid}
          onClick={approve}
          className="rounded-md bg-neutral-900 px-3 py-1 text-xs font-medium text-white disabled:opacity-40"
        >
          Approve
        </button>
        <button
          type="button"
          data-testid={`subject-suggestion-edit-${suggestion.id}`}
          disabled={busy}
          onClick={() => setEditing((value) => !value)}
          className="rounded-md border border-neutral-300 px-3 py-1 text-xs text-neutral-600 disabled:opacity-40"
        >
          Edit name
        </button>
        <button
          type="button"
          data-testid={`subject-suggestion-dismiss-${suggestion.id}`}
          disabled={busy}
          onClick={() => void send({ action: 'dismiss' })}
          className="rounded-md border border-neutral-300 px-3 py-1 text-xs text-neutral-600 disabled:opacity-40"
        >
          Dismiss
        </button>
      </div>

      {error ? (
        <p data-testid={`subject-suggestion-error-${suggestion.id}`} className="mt-2 text-xs text-red-600">
          {error}
        </p>
      ) : null}
    </li>
  )
}
