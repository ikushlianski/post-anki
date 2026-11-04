import { scaleLinear } from '../analytics/review-statistics/chart-scale'
import type { LearningStats } from './stats.types'

const WIDTH = 600
const HEIGHT = 160

export function DailyReviewsChart({ days }: { days: LearningStats['daily'] }) {
  const max = Math.max(0, ...days.map((day) => day.reviews + day.newCards))
  const scale = scaleLinear(max, HEIGHT)
  const slot = WIDTH / Math.max(days.length, 1)
  const labelEvery = Math.max(1, Math.ceil(days.length / 10))

  return (
    <div data-testid="daily-reviews-chart">
      {days.length === 0 ? <p className="mb-2 text-sm text-neutral-600">No reviews in this period.</p> : null}
      <svg
        role="img"
        aria-label={`Reviews per day over ${days.length} days, new cards highlighted`}
        viewBox={`0 0 ${WIDTH} ${HEIGHT + 20}`}
        className="w-full"
      >
        <line x1={0} x2={WIDTH} y1={HEIGHT} y2={HEIGHT} className="stroke-neutral-300" />
        {days.map((day, index) => {
          const reviewsHeight = scale(day.reviews)
          const newHeight = scale(day.newCards)
          const x = index * slot + slot * 0.15

          return (
            <g key={day.date}>
              <rect x={x} y={HEIGHT - reviewsHeight} width={slot * 0.7} height={reviewsHeight} className="fill-neutral-800">
                <title>{`${day.date}: ${day.reviews} reviews, ${day.newCards} new`}</title>
              </rect>
              <rect
                x={x}
                y={HEIGHT - reviewsHeight - newHeight}
                width={slot * 0.7}
                height={newHeight}
                className="fill-emerald-500"
              />
              {index % labelEvery === 0 ? (
                <text x={index * slot + slot / 2} y={HEIGHT + 14} textAnchor="middle" className="fill-neutral-500 text-[10px]">
                  {day.date.slice(5)}
                </text>
              ) : null}
            </g>
          )
        })}
      </svg>
      <p className="mt-1 text-xs text-neutral-500">
        <span className="inline-block h-2 w-2 bg-neutral-800" /> reviews{' '}
        <span className="ml-2 inline-block h-2 w-2 bg-emerald-500" /> new cards
      </p>
      <table className="sr-only">
        <caption>Reviews and new cards per day</caption>
        <tbody>
          {days.map((day) => (
            <tr key={day.date}>
              <th scope="row">{day.date}</th>
              <td>{day.reviews} reviews</td>
              <td>{day.newCards} new</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
