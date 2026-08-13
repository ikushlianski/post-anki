import type { FetchState } from '@post-anki/shared'

import { fetchStateLabel } from './fetch-state-label'

const COLOR: Record<FetchState, string> = {
  fetched: 'bg-emerald-50 text-emerald-700',
  stale_failed: 'bg-rose-50 text-rose-700',
  never_fetched: 'bg-neutral-100 text-neutral-500',
}

export interface FetchStateBadgeProps {
  state: FetchState
}

export function FetchStateBadge({ state }: FetchStateBadgeProps) {
  return (
    <span
      data-testid="fetch-state-badge"
      data-state={state}
      className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${COLOR[state]}`}
    >
      {fetchStateLabel(state)}
    </span>
  )
}
