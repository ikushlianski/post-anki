import type { AiSpend } from './stats.types'

export function StatsTriageByModel({ rows }: { rows: AiSpend['triageByModel'] }) {
  if (rows.length === 0) {
    return (
      <p data-testid="triage-by-model-empty" className="text-sm text-neutral-600">
        No fusion decisions in this period.
      </p>
    )
  }

  return (
    <div className="overflow-x-auto">
      <table data-testid="triage-by-model" className="w-full text-sm">
        <thead>
          <tr className="text-left text-xs text-neutral-500">
            <th scope="col" className="font-normal">
              Model
            </th>
            <th scope="col" className="text-right font-normal">
              Kept
            </th>
            <th scope="col" className="text-right font-normal">
              Rejected
            </th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.modelId} data-testid={`triage-by-model-${row.modelId}`}>
              <th scope="row" className="break-all py-0.5 text-left font-normal">
                {row.modelId}
              </th>
              <td className="text-right">{row.kept}</td>
              <td className="text-right">{row.rejected}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
