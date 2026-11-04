import { scaleLinear } from '../analytics/review-statistics/chart-scale'
import type { AiSpend } from './stats.types'

const WIDTH = 600
const HEIGHT = 160

export function formatUsd(value: number): string {
  return `$${value.toFixed(value < 1 ? 3 : 2)}`
}

export function AiSpendChart({ spend }: { spend: AiSpend }) {
  const max = Math.max(0, ...spend.days.map((day) => day.cardsUsd + day.chatUsd + day.otherUsd))
  const scale = scaleLinear(max, HEIGHT)
  const slot = WIDTH / Math.max(spend.days.length, 1)
  const labelEvery = Math.max(1, Math.ceil(spend.days.length / 10))

  return (
    <div data-testid="ai-spend-chart">
      {spend.days.length === 0 ? <p className="mb-2 text-sm text-neutral-600">No AI spend in this period.</p> : null}
      <svg
        role="img"
        aria-label={`Estimated AI spend per day over ${spend.days.length} days, cards versus chat`}
        viewBox={`0 0 ${WIDTH} ${HEIGHT + 20}`}
        className="w-full"
      >
        <line x1={0} x2={WIDTH} y1={HEIGHT} y2={HEIGHT} className="stroke-neutral-300" />
        {spend.days.map((day, index) => {
          const x = index * slot + slot * 0.15
          const cards = scale(day.cardsUsd)
          const chat = scale(day.chatUsd)
          const other = scale(day.otherUsd)

          return (
            <g key={day.date}>
              <title>{`${day.date}: cards ${formatUsd(day.cardsUsd)}, chat ${formatUsd(day.chatUsd)}, other ${formatUsd(day.otherUsd)}`}</title>
              <rect x={x} y={HEIGHT - cards} width={slot * 0.7} height={cards} className="fill-neutral-800" />
              <rect x={x} y={HEIGHT - cards - chat} width={slot * 0.7} height={chat} className="fill-sky-500" />
              <rect x={x} y={HEIGHT - cards - chat - other} width={slot * 0.7} height={other} className="fill-neutral-400" />
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
        <span className="inline-block h-2 w-2 bg-neutral-800" /> cards <span className="ml-2 inline-block h-2 w-2 bg-sky-500" />{' '}
        chat <span className="ml-2 inline-block h-2 w-2 bg-neutral-400" /> other
      </p>
      <p data-testid="spend-estimate-note" className="mt-1 text-xs text-neutral-500">
        Estimated; {spend.unpriced.calls} calls unpriced.
      </p>
      <div className="mt-3 overflow-x-auto" data-testid="spend-by-model-scroll">
      <table data-testid="spend-by-model" className="w-full text-sm">
        <caption className="mb-1 text-left text-xs text-neutral-500">Spend by model</caption>
        <tbody>
          {spend.byModel.map((model) => (
            <tr key={model.modelId}>
              <th scope="row" className="break-all py-0.5 text-left font-normal">
                {model.modelId}
              </th>
              <td className="text-right">{formatUsd(model.usd)}</td>
            </tr>
          ))}
        </tbody>
      </table>
      </div>
      <table className="sr-only">
        <caption>Estimated AI spend per day</caption>
        <tbody>
          {spend.days.map((day) => (
            <tr key={day.date}>
              <th scope="row">{day.date}</th>
              <td>cards {formatUsd(day.cardsUsd)}</td>
              <td>chat {formatUsd(day.chatUsd)}</td>
              <td>other {formatUsd(day.otherUsd)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
