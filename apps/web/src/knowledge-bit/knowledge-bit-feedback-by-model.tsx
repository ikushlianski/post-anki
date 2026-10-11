import {
  KNOWLEDGE_BIT_REJECT_REASON_LABELS,
  KNOWLEDGE_ITEM_MODELS,
  type KnowledgeBitFeedbackByModelResponse,
  type KnowledgeBitFeedbackModelStats,
} from '@post-anki/shared'

export function formatRejectRate(stats: Pick<KnowledgeBitFeedbackModelStats, 'approved' | 'rejected'>): string {
  const total = stats.approved + stats.rejected

  if (total === 0) {
    return '-'
  }

  return `${Math.round((stats.rejected / total) * 100)}%`
}

export function modelLabel(modelId: string): string {
  const known = (KNOWLEDGE_ITEM_MODELS as Record<string, { label: string }>)[modelId]

  return known?.label ?? modelId
}

export function KnowledgeBitFeedbackByModel({ data }: { data: KnowledgeBitFeedbackByModelResponse }) {
  if (data.models.length === 0) {
    return (
      <p data-testid="feedback-by-model-empty" className="text-sm text-neutral-500">
        No reviewed suggestions yet.
      </p>
    )
  }

  return (
    <div className="overflow-x-auto rounded-lg bg-neutral-50">
      <table data-testid="feedback-by-model-table" className="w-full text-left text-sm">
        <thead className="text-xs uppercase text-neutral-500">
          <tr>
            <th className="px-4 py-2">Model</th>
            <th className="px-4 py-2">Approved</th>
            <th className="px-4 py-2">Rejected</th>
            <th className="px-4 py-2">Reject rate</th>
            <th className="px-4 py-2">Top reasons</th>
          </tr>
        </thead>
        <tbody>
          {data.models.map((stats) => (
            <tr key={stats.modelId} data-testid={`feedback-by-model-row-${stats.modelId}`}>
              <td className="px-4 py-2 font-medium">{modelLabel(stats.modelId)}</td>
              <td className="px-4 py-2">{stats.approved}</td>
              <td className="px-4 py-2">{stats.rejected}</td>
              <td className="px-4 py-2">{formatRejectRate(stats)}</td>
              <td className="px-4 py-2 text-neutral-600">
                {stats.topReasons
                  .map((reason) => `${KNOWLEDGE_BIT_REJECT_REASON_LABELS[reason.reasonCode]} (${reason.count})`)
                  .join(', ') || '-'}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
