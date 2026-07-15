import type { StrongPoint, WeakSpot } from '@post-anki/shared'

export function WeakStrongList({
  weakSpots,
  strongPoints,
  attemptedTopicCount,
}: {
  weakSpots: WeakSpot[]
  strongPoints: StrongPoint[]
  attemptedTopicCount: number
}) {
  if (attemptedTopicCount === 0) {
    return (
      <p
        data-testid="stats-empty-state"
        className="rounded-lg border border-dashed border-neutral-300 bg-white p-6 text-center text-sm text-neutral-500"
      >
        Nothing to show yet — answer a question or two in this curriculum and
        your weak spots and strong points will show up here.
      </p>
    )
  }

  return (
    <div className="grid gap-5 sm:grid-cols-2">
      <section data-testid="weak-spots-list">
        <h2 className="mb-2 text-xs font-medium uppercase tracking-wide text-neutral-400">
          Weak spots
        </h2>
        {weakSpots.length === 0 ? (
          <p className="text-sm text-neutral-400">No weak spots right now.</p>
        ) : (
          <ul className="space-y-2">
            {weakSpots.map((spot) => (
              <li
                key={spot.topicId}
                data-testid="weak-spot-item"
                className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm"
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="font-medium text-amber-900">{spot.topicTitle}</span>
                  <span className="text-xs text-amber-700">{spot.maturity}% mature</span>
                </div>
                {spot.openGapLabels.length > 0 ? (
                  <p className="mt-1 text-xs text-amber-700">
                    {spot.openGapLabels.join(', ')}
                  </p>
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </section>

      <section data-testid="strong-points-list">
        <h2 className="mb-2 text-xs font-medium uppercase tracking-wide text-neutral-400">
          Strong points
        </h2>
        {strongPoints.length === 0 ? (
          <p className="text-sm text-neutral-400">Nothing mastered yet.</p>
        ) : (
          <ul className="space-y-2">
            {strongPoints.map((point) => (
              <li
                key={point.topicId}
                data-testid="strong-point-item"
                className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm font-medium text-emerald-900"
              >
                {point.topicTitle}
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  )
}
