import { KNOWLEDGE_ITEM_MODELS, knowledgeItemModelIdSchema, type ModelComparisonRunSummary } from '@post-anki/shared'

function modelLabel(modelId: string): string {
  const parsed = knowledgeItemModelIdSchema.safeParse(modelId)

  return parsed.success ? KNOWLEDGE_ITEM_MODELS[parsed.data].label : modelId
}

export function ModelComparisonRunsList({
  runs,
  activeRunId,
  onOpen,
  onRepeat,
  repeatDisabled,
}: {
  runs: readonly ModelComparisonRunSummary[]
  activeRunId: string | null
  onOpen: (runId: string) => void
  onRepeat: (runId: string) => void
  repeatDisabled: boolean
}) {
  if (runs.length === 0) {
    return <p className="text-sm text-neutral-500">No comparisons yet.</p>
  }

  return (
    <ul className="space-y-1" data-testid="model-comparison-runs">
      {runs.map((run) => (
        <li key={run.runId} className="flex items-stretch gap-1">
          <button
            type="button"
            onClick={() => onOpen(run.runId)}
            aria-current={run.runId === activeRunId}
            data-testid={`model-comparison-run-${run.runId}`}
            className={`min-w-0 flex-1 rounded-md px-3 py-2 text-left text-sm hover:bg-neutral-100 ${
              run.runId === activeRunId ? 'bg-neutral-100' : ''
            }`}
          >
            <span className="block truncate font-medium text-neutral-900">{run.excerptPreview}</span>
            <span className="block text-xs text-neutral-500">
              {new Date(run.createdAt).toLocaleString()} · {run.modelIds.map(modelLabel).join(', ')}
            </span>
          </button>
          <button
            type="button"
            disabled={repeatDisabled}
            onClick={() => onRepeat(run.runId)}
            data-testid={`model-comparison-repeat-${run.runId}`}
            aria-label="Run this comparison again"
            className="shrink-0 rounded-md px-3 text-xs font-medium text-neutral-700 hover:bg-neutral-100 disabled:cursor-not-allowed disabled:opacity-50"
          >
            Run again
          </button>
        </li>
      ))}
    </ul>
  )
}
