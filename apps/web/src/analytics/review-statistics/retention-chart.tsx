import type { ReviewStatistics } from '@post-anki/shared'

import { bandX, formatPercent, linePath, scaleLinear } from './chart-scale'

const WIDTH = 600
const HEIGHT = 160
const MIN_RELIABLE_REVIEWS = 5

export function RetentionChart({ retention }: { retention: ReviewStatistics['retention'] }) {
  const scale = scaleLinear(1, HEIGHT)
  const points = retention.points.map((point, index) => ({
    ...point,
    x: bandX(index, retention.points.length, WIDTH),
    y: point.rate === null ? null : HEIGHT - scale(point.rate),
  }))

  return (
    <div data-testid="retention-chart">
      <p className="mb-2 text-sm text-neutral-600">
        Overall review retention: <span data-testid="retention-overall">{formatPercent(retention.overallRate)}</span>{' '}
        (by {retention.granularity}, only cards already in the review phase)
      </p>
      {retention.points.length === 0 ? (
        <p data-testid="retention-empty" className="text-sm text-neutral-500">
          No reviews in this period.
        </p>
      ) : (
        <>
          <svg
            role="img"
            aria-label={`Share of review-phase answers that were not Again, by ${retention.granularity}`}
            viewBox={`0 0 ${WIDTH} ${HEIGHT + 4}`}
            className="w-full overflow-visible"
          >
            <line x1={0} x2={WIDTH} y1={HEIGHT} y2={HEIGHT} className="stroke-neutral-300" />
            <line x1={0} x2={WIDTH} y1={HEIGHT / 2} y2={HEIGHT / 2} className="stroke-neutral-100" />
            <path d={linePath(points)} fill="none" className="stroke-neutral-800" strokeWidth={2} />
            {points.map((point) =>
              point.y === null ? null : (
                <circle
                  key={point.date}
                  cx={point.x}
                  cy={point.y}
                  r={3}
                  className={point.total < MIN_RELIABLE_REVIEWS ? 'fill-neutral-400' : 'fill-neutral-800'}
                >
                  <title>{`${point.date}: ${formatPercent(point.rate)} of ${point.total} reviews`}</title>
                </circle>
              ),
            )}
          </svg>
          <table className="sr-only">
            <caption>Review retention</caption>
            <tbody>
              {retention.points.map((point) => (
                <tr key={point.date}>
                  <th scope="row">{point.date}</th>
                  <td>{formatPercent(point.rate)}</td>
                  <td>{point.total} reviews</td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      )}
    </div>
  )
}
