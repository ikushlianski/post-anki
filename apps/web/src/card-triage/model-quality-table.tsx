import type { CardQualityModelRow } from '@post-anki/shared'

import { useCardQuality } from './use-card-quality'

function percent(rate: number | null): string {
  return rate === null ? '–' : `${Math.round(rate * 100)}%`
}

function ModelRow({ row }: { row: CardQualityModelRow }) {
  return (
    <tr data-testid={`model-quality-row-${row.modelId}`} className="border-t border-neutral-200">
      <th scope="row" className="py-1.5 pr-3 text-left font-medium">
        {row.modelId === 'unknown' ? 'Unknown (before tracking)' : row.modelId}
      </th>
      <td className="px-2 text-right">{row.approved}</td>
      <td className="px-2 text-right">{row.rejected}</td>
      <td className="px-2 text-right">{row.chat}</td>
      <td className="px-2 text-right">{row.pending}</td>
      <td className="px-2 text-right">{row.superseded}</td>
      <td className="px-2 text-right">{percent(row.approvalRate)}</td>
      <td className="pl-2 text-right">{row.averageRating === null ? '–' : row.averageRating.toFixed(1)}</td>
    </tr>
  )
}

export function ModelQualityTable() {
  const { data, isPending, isError } = useCardQuality()

  return (
    <section data-testid="model-quality" className="mb-8">
      <h2 className="mb-2 text-lg font-semibold tracking-tight">Card quality by model, all time</h2>
      {isPending ? <p className="text-sm text-neutral-500">Loading…</p> : null}
      {isError ? (
        <p role="alert" data-testid="model-quality-error" className="text-sm text-red-600">
          Could not load model quality.
        </p>
      ) : null}
      {data && data.models.length === 0 ? (
        <p data-testid="model-quality-empty" className="text-sm text-neutral-500">
          No cards yet.
        </p>
      ) : null}
      {data && data.models.length > 0 ? (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-xs text-neutral-500">
              <tr>
                <th scope="col" className="pr-3 text-left font-normal">Model</th>
                <th scope="col" className="px-2 text-right font-normal">Approved</th>
                <th scope="col" className="px-2 text-right font-normal">Rejected</th>
                <th scope="col" className="px-2 text-right font-normal">Chat</th>
                <th scope="col" className="px-2 text-right font-normal">Pending</th>
                <th scope="col" className="px-2 text-right font-normal">Superseded</th>
                <th scope="col" className="px-2 text-right font-normal">Approval rate</th>
                <th scope="col" className="pl-2 text-right font-normal">Avg rating</th>
              </tr>
            </thead>
            <tbody>
              {data.models.map((row) => (
                <ModelRow key={row.modelId} row={row} />
              ))}
            </tbody>
          </table>
        </div>
      ) : null}
    </section>
  )
}
