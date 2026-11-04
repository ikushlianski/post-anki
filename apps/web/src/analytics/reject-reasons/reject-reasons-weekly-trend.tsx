import { KNOWLEDGE_BIT_REJECT_REASON_LABELS, type RejectReasonWeek } from '@post-anki/shared'

const WIDTH = 240
const HEIGHT = 48
const GAP = 4

function percent(rate: number): string {
  return `${Math.round(rate * 100)}%`
}

function describe(week: RejectReasonWeek): string {
  return week.decided === 0
    ? `Week of ${week.weekStart}: no decisions`
    : `Week of ${week.weekStart}: ${week.rejected} of ${week.decided} rejected (${percent(week.rejectRate)})`
}

export function RejectReasonsWeeklyTrend({ weekly }: { weekly: RejectReasonWeek[] }) {
  const active = weekly.filter((week) => week.decided > 0)

  if (active.length === 0) {
    return (
      <p data-testid="reject-trend-empty" className="text-sm text-neutral-500">
        No triage decisions in the last 12 weeks
      </p>
    )
  }

  const barWidth = (WIDTH - GAP * (weekly.length - 1)) / weekly.length
  const latest = active[active.length - 1]
  const previous = active.length > 1 ? active[active.length - 2] : undefined
  const topCodes = (weekly.find((week) => week.topReasons.length > 0)?.topReasons ?? []).map((r) => r.reasonCode)

  return (
    <div data-testid="reject-trend" className="mt-6">
      <h3 className="mb-1 text-sm font-medium">Reject rate per week</h3>
      <p data-testid="reject-trend-label" className="mb-2 text-sm text-neutral-600">
        Latest week with decisions: {percent(latest.rejectRate)}
        {previous ? ` (previous: ${percent(previous.rejectRate)})` : ''}
      </p>
      <svg
        role="img"
        aria-label={`Reject rate per week over the last ${weekly.length} weeks, oldest first. ${weekly.map(describe).join('. ')}`}
        viewBox={`0 0 ${WIDTH} ${HEIGHT + 2}`}
        className="h-12 w-60"
      >
        <line x1={0} x2={WIDTH} y1={HEIGHT} y2={HEIGHT} className="stroke-neutral-300" />
        {weekly.map((week, index) => (
          <rect
            key={week.weekStart}
            x={index * (barWidth + GAP)}
            y={HEIGHT - week.rejectRate * HEIGHT}
            width={barWidth}
            height={week.rejectRate * HEIGHT}
            className="fill-neutral-800"
          />
        ))}
      </svg>
      <div className="mt-3 overflow-x-auto" data-testid="reject-trend-scroll">
      <table data-testid="reject-trend-table" className="min-w-max text-xs text-neutral-600">
        <caption className="sr-only">Weekly rejections and top reasons</caption>
        <thead>
          <tr>
            <th className="pr-3 text-left font-medium">Week</th>
            <th className="pr-3 text-right font-medium">Rejected / decided</th>
            {topCodes.map((code) => (
              <th key={code} className="pr-3 text-right font-medium">
                {KNOWLEDGE_BIT_REJECT_REASON_LABELS[code]}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {active.map((week) => (
            <tr key={week.weekStart}>
              <td className="pr-3">{week.weekStart}</td>
              <td className="pr-3 text-right tabular-nums">
                {week.rejected} / {week.decided} ({percent(week.rejectRate)})
              </td>
              {topCodes.map((code) => (
                <td key={code} className="pr-3 text-right tabular-nums">
                  {week.topReasons.find((r) => r.reasonCode === code)?.count ?? 0}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
      </div>
    </div>
  )
}
