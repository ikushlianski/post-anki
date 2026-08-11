import { useState } from 'react'

import type { LearningPath, LearningPathStatus } from '@post-anki/shared'

import type { ApiResult } from './learning-path.model'

export interface AbandonPathControlProps {
  pathId: string
  status: LearningPathStatus
  onAbandon: (pathId: string) => Promise<ApiResult<LearningPath>>
  onAbandoned: () => void | Promise<void>
}

const ABANDONABLE: LearningPathStatus[] = ['draft', 'active']

export function AbandonPathControl({
  pathId,
  status,
  onAbandon,
  onAbandoned,
}: AbandonPathControlProps) {
  const [confirming, setConfirming] = useState(false)
  const [busy, setBusy] = useState(false)

  if (!ABANDONABLE.includes(status)) {
    return null
  }

  async function confirm() {
    setBusy(true)

    const result = await onAbandon(pathId)

    setBusy(false)

    if (result.ok) {
      await onAbandoned()
    }
  }

  if (!confirming) {
    return (
      <button
        type="button"
        data-testid="abandon-path-start"
        onClick={() => setConfirming(true)}
        className="text-xs text-neutral-400 hover:text-rose-600"
      >
        Abandon this path
      </button>
    )
  }

  return (
    <div
      data-testid="abandon-path-confirm"
      className="rounded-md border border-rose-200 bg-rose-50 p-3"
    >
      <p className="text-xs text-rose-800">
        Nothing is deleted — every mapped curriculum and every bit of progress stays
        exactly as it is. This path just stops being suggested.
      </p>
      <div className="mt-2 flex gap-2">
        <button
          type="button"
          disabled={busy}
          data-testid="abandon-path-confirm-button"
          onClick={() => void confirm()}
          className="rounded-md bg-rose-600 px-3 py-1.5 text-xs font-medium text-white disabled:opacity-50"
        >
          {busy ? 'Abandoning…' : 'Yes, abandon it'}
        </button>
        <button
          type="button"
          data-testid="abandon-path-cancel"
          onClick={() => setConfirming(false)}
          className="rounded-md border border-neutral-300 px-3 py-1.5 text-xs text-neutral-600"
        >
          Cancel
        </button>
      </div>
    </div>
  )
}
