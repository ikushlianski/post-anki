import { useCallback, useEffect, useState } from 'react'
import type { RewordedDraft } from '@post-anki/shared'

import { decideRewordedDraft, listRewordedDrafts } from './reworded-drafts.api'

export function RewordedDraftsSection() {
  const [drafts, setDrafts] = useState<RewordedDraft[]>([])
  const [busyId, setBusyId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    try {
      const outcome = await listRewordedDrafts()

      if (outcome.ok) {
        setDrafts(outcome.data)
      }
    } catch {
      setDrafts([])
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  async function decide(draftId: string, decision: 'approved' | 'rejected') {
    setBusyId(draftId)
    setError(null)

    try {
      const outcome = await decideRewordedDraft({ data: { draftId, decision } })

      if (!outcome.ok && outcome.status !== 409) {
        setError("Couldn't save that decision. Try again.")

        return
      }

      setDrafts((previous) => previous.filter((draft) => draft.id !== draftId))
    } catch {
      setError("Couldn't save that decision. Try again.")
    } finally {
      setBusyId(null)
    }
  }

  if (drafts.length === 0) {
    return null
  }

  return (
    <section data-testid="reworded-drafts-section" className="mt-6 space-y-3">
      <h2 className="text-sm font-semibold text-neutral-900">
        Reworded versions to approve ({drafts.length})
      </h2>
      {error ? (
        <p role="alert" className="text-sm text-red-700">
          {error}
        </p>
      ) : null}
      <ul className="space-y-3">
        {drafts.map((draft) => (
          <li
            key={draft.id}
            data-testid={`reworded-draft-${draft.id}`}
            className="space-y-2 rounded-md border border-neutral-200 p-3 text-sm"
          >
            <p className="text-neutral-600">
              Original: <span data-testid={`reworded-original-${draft.id}`}>{draft.originalPrompt}</span>
            </p>
            <p className="font-medium text-neutral-900">
              Reworded: <span data-testid={`reworded-prompt-${draft.id}`}>{draft.prompt}</span>
            </p>
            <p className="text-neutral-700">
              Answer: <span data-testid={`reworded-answer-${draft.id}`}>{draft.answer}</span>
            </p>
            <div className="flex gap-2">
              <button
                type="button"
                disabled={busyId === draft.id}
                onClick={() => void decide(draft.id, 'approved')}
                className="rounded-md bg-neutral-900 px-3 py-1 text-white disabled:opacity-50"
              >
                Approve
              </button>
              <button
                type="button"
                disabled={busyId === draft.id}
                onClick={() => void decide(draft.id, 'rejected')}
                className="rounded-md border border-neutral-300 px-3 py-1 disabled:opacity-50"
              >
                Reject
              </button>
            </div>
          </li>
        ))}
      </ul>
    </section>
  )
}
