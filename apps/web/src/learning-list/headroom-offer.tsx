import { useState } from 'react'

import type { DepthLevel } from '@post-anki/shared'

import {
  TOP_AVAILABLE_DEPTH,
  headroomDeclineText,
  headroomOfferText,
  headroomToOffer,
} from './headroom'

export interface HeadroomOfferProps {
  electedDepth: DepthLevel | null
  availableDepth?: DepthLevel
  mastered: boolean
  lastOfferAt: string | null
  now: string
  onAccept: (depth: DepthLevel) => Promise<void>
  onDecline: (offeredAt: string) => Promise<void>
}

export function HeadroomOffer({
  electedDepth,
  availableDepth = TOP_AVAILABLE_DEPTH,
  mastered,
  lastOfferAt,
  now,
  onAccept,
  onDecline,
}: HeadroomOfferProps) {
  const [busy, setBusy] = useState(false)
  const [declined, setDeclined] = useState(false)

  const headroom = headroomToOffer({
    electedDepth,
    availableDepth,
    mastered,
    lastOfferAt,
    now,
  })

  if (headroom === null) {
    return null
  }

  if (declined) {
    return (
      <p
        role="status"
        data-testid="headroom-declined"
        className="mb-4 rounded-lg border border-neutral-200 bg-white px-4 py-2 text-xs text-neutral-500"
      >
        {headroomDeclineText()}
      </p>
    )
  }

  const nextDepth = headroom.nextDepth

  async function accept() {
    setBusy(true)
    await onAccept(nextDepth)
    setBusy(false)
  }

  async function decline() {
    setDeclined(true)
    await onDecline(now)
  }

  return (
    <div
      data-testid="headroom-offer"
      data-next-depth={headroom.nextDepth}
      className="mb-4 rounded-lg border border-emerald-300 bg-emerald-50 p-4"
    >
      <p className="text-sm text-emerald-900">{headroomOfferText(headroom)}</p>
      <div className="mt-3 flex gap-2">
        <button
          type="button"
          disabled={busy}
          onClick={() => void accept()}
          data-testid="headroom-accept"
          className="rounded-md bg-emerald-700 px-3 py-1.5 text-xs font-medium text-white disabled:opacity-50"
        >
          Go advanced
        </button>
        <button
          type="button"
          disabled={busy}
          onClick={() => void decline()}
          data-testid="headroom-decline"
          className="rounded-md border border-emerald-300 bg-white px-3 py-1.5 text-xs font-medium text-emerald-800 disabled:opacity-50"
        >
          Not now
        </button>
      </div>
    </div>
  )
}
