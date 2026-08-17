import type { LivenessStatus } from '@post-anki/shared'

import {
  livenessBadgeClass,
  livenessDescription,
  livenessLabel,
  livenessTone,
} from './liveness-presentation'

export function LivenessBadge({
  liveness,
}: {
  liveness: LivenessStatus | null
}) {
  return (
    <span
      data-testid="liveness-badge"
      data-tone={livenessTone(liveness)}
      title={livenessDescription(liveness)}
      className={`shrink-0 rounded-full border px-2 py-0.5 text-[11px] font-medium ${livenessBadgeClass(liveness)}`}
    >
      {livenessLabel(liveness)}
    </span>
  )
}
