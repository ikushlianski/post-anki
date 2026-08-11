import type { FetchState } from '@post-anki/shared'

const LABELS: Record<FetchState, string> = {
  fetched: 'Fetched',
  stale_failed: 'Fetch failed',
  never_fetched: 'Never fetched',
}

export function fetchStateLabel(state: FetchState): string {
  return LABELS[state]
}
