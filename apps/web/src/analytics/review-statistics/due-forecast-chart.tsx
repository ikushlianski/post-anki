import type { ReviewStatistics } from '@post-anki/shared'

import { scaleLinear } from './chart-scale'

const WIDTH = 600
const HEIGHT = 160

export function DueForecastChart({ forecast }: { forecast: ReviewStatistics['forecast'] }) {
  const max = Math.max(0, ...forecast.days.map((day) => day.count))
  const scale = scaleLinear(max, HEIGHT)
  const slot = WIDTH / Math.max(forecast.days.length, 1)
  const upcoming = forecast.days.reduce((sum, day) => sum + day.count, 0)

  return (
    <div data-testid="due-forecast">
      <p className="mb-2 text-sm text-neutral-600">
        <span data-testid="forecast-overdue">{forecast.overdue}</span> due now, {upcoming} more in the next{' '}
        {forecast.days.length} days.
        {upcoming === 0 ? ` Nothing due in the next ${forecast.days.length} days.` : ''}
      </p>
      <svg
        role="img"
        aria-label={`Cards due per day for the next ${forecast.days.length} days`}
        viewBox={`0 0 ${WIDTH} ${HEIGHT + 20}`}
        className="w-full"
      >
        <line x1={0} x2={WIDTH} y1={HEIGHT} y2={HEIGHT} className="stroke-neutral-300" />
        {forecast.days.map((day, index) => (
          <g key={day.date}>
            <rect
              x={index * slot + slot * 0.15}
              y={HEIGHT - scale(day.count)}
              width={slot * 0.7}
              height={scale(day.count)}
              className="fill-neutral-800"
            >
              <title>{`${day.date}: ${day.count} due`}</title>
            </rect>
            {forecast.days.length <= 14 || index % 2 === 0 ? (
              <text x={index * slot + slot / 2} y={HEIGHT + 14} textAnchor="middle" className="fill-neutral-500 text-[10px]">
                {day.date.slice(5)}
              </text>
            ) : null}
          </g>
        ))}
      </svg>
      <table className="sr-only">
        <caption>Cards due per day</caption>
        <tbody>
          {forecast.days.map((day) => (
            <tr key={day.date}>
              <th scope="row">{day.date}</th>
              <td>{day.count}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
