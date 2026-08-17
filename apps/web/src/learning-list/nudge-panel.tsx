import { useState } from 'react'

import type {
  DailyPushNudge,
  NudgeResponse,
  NudgeResponseInput,
} from '@post-anki/shared'

import type { ApiResult } from './learning-list.model'

const OUTCOME: Record<NudgeResponse, string> = {
  yes: 'Kept. It is back above the threshold and picks up from where it stopped — not from the beginning.',
  no: 'Set aside. It stops surfacing but nothing was deleted; your answers stay. Say yes to a later nudge to bring it back.',
}

export interface NudgePanelProps {
  nudge: DailyPushNudge
  onRespond: (input: NudgeResponseInput) => Promise<ApiResult<unknown>>
  onResponded: () => void | Promise<void>
}

export function NudgePanel({ nudge, onRespond, onResponded }: NudgePanelProps) {
  const [busy, setBusy] = useState(false)
  const [outcome, setOutcome] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  async function respond(response: NudgeResponse) {
    setBusy(true)
    setError(null)

    const result = await onRespond({
      entityType: nudge.entityType,
      entityId: nudge.entityId,
      response,
    })

    setBusy(false)

    if (!result.ok) {
      setError('That answer was not recorded — try again.')
      return
    }

    setOutcome(OUTCOME[response])
    await onResponded()
  }

  return (
    <div
      data-testid="nudge-panel"
      data-entity-type={nudge.entityType}
      className="mb-6 rounded-xl border border-amber-300 bg-amber-50 p-4"
    >
      <p className="text-sm text-amber-950">
        Do you still want to learn{' '}
        <span className="font-medium" data-testid="nudge-name">
          {nudge.name}
        </span>
        ?
      </p>

      {nudge.related.length > 0 ? (
        <p className="mt-1 text-xs text-amber-800" data-testid="nudge-related">
          Going quiet alongside it:{' '}
          {nudge.related.map((related) => related.name).join(', ')}
        </p>
      ) : null}

      {outcome ? (
        <p
          role="status"
          data-testid="nudge-outcome"
          className="mt-3 rounded-md border border-amber-300 bg-white px-3 py-2 text-xs text-amber-900"
        >
          {outcome}
        </p>
      ) : (
        <div className="mt-3 flex gap-2">
          <button
            type="button"
            disabled={busy}
            onClick={() => void respond('yes')}
            data-testid="nudge-yes"
            className="rounded-md bg-amber-700 px-3 py-1.5 text-xs font-medium text-white disabled:opacity-50"
          >
            Yes, keep it going
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={() => void respond('no')}
            data-testid="nudge-no"
            className="rounded-md border border-amber-300 bg-white px-3 py-1.5 text-xs font-medium text-amber-900 disabled:opacity-50"
          >
            No, set it aside
          </button>
        </div>
      )}

      {error ? (
        <p role="alert" className="mt-2 text-xs text-rose-700">
          {error}
        </p>
      ) : null}
    </div>
  )
}
