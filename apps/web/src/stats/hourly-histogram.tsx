import { scaleLinear } from '../analytics/review-statistics/chart-scale'
import type { LearningStats } from './stats.types'

const WIDTH = 600
const HEIGHT = 120

export function HourlyHistogram({ hourly }: { hourly: LearningStats['hourly'] }) {
  const max = Math.max(0, ...hourly.map((entry) => entry.reviews))
  const scale = scaleLinear(max, HEIGHT)
  const slot = WIDTH / Math.max(hourly.length, 1)

  return (
    <div data-testid="hourly-histogram">
      {max === 0 ? <p className="mb-2 text-sm text-neutral-600">No reviews in this period.</p> : null}
      <svg role="img" aria-label="Reviews by hour of day" viewBox={`0 0 ${WIDTH} ${HEIGHT + 20}`} className="w-full">
        <line x1={0} x2={WIDTH} y1={HEIGHT} y2={HEIGHT} className="stroke-neutral-300" />
        {hourly.map((entry, index) => (
          <g key={entry.hour}>
            <rect
              x={index * slot + slot * 0.15}
              y={HEIGHT - scale(entry.reviews)}
              width={slot * 0.7}
              height={scale(entry.reviews)}
              className="fill-neutral-800"
            >
              <title>{`${entry.hour}:00: ${entry.reviews} reviews`}</title>
            </rect>
            {entry.hour % 3 === 0 ? (
              <text x={index * slot + slot / 2} y={HEIGHT + 14} textAnchor="middle" className="fill-neutral-500 text-[10px]">
                {entry.hour}
              </text>
            ) : null}
          </g>
        ))}
      </svg>
      <table className="sr-only">
        <caption>Reviews by hour of day</caption>
        <tbody>
          {hourly.map((entry) => (
            <tr key={entry.hour}>
              <th scope="row">{entry.hour}:00</th>
              <td>{entry.reviews}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
