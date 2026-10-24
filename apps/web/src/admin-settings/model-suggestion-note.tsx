import type { ModelSuggestionResult } from '@post-anki/core'
import { MIN_GRADED_RUNS_PER_MODEL } from '@post-anki/core'
import {
  KNOWLEDGE_ITEM_MODELS,
  knowledgeItemModelIdSchema,
  type KnowledgeItemModelId,
} from '@post-anki/shared'

function labelFor(modelId: string): string {
  const parsed = knowledgeItemModelIdSchema.safeParse(modelId)

  return parsed.success ? KNOWLEDGE_ITEM_MODELS[parsed.data].label : modelId
}

export function ModelSuggestionNote({
  suggestion,
  currentModelId,
  onUse,
  disabled,
}: {
  suggestion: ModelSuggestionResult | null
  currentModelId?: KnowledgeItemModelId
  onUse?: (modelId: KnowledgeItemModelId) => void
  disabled?: boolean
}) {
  if (!suggestion) {
    return null
  }

  if (suggestion.status === 'not_enough_evidence') {
    return (
      <div data-testid="model-suggestion-note" className="mt-3 text-xs text-neutral-500">
        <p data-testid="model-suggestion-summary">
          Not enough grades yet: {suggestion.modelsReady} of {suggestion.modelsNeeded} models have{' '}
          {MIN_GRADED_RUNS_PER_MODEL} graded runs.
        </p>
        {suggestion.perModelProgress.length > 0 ? (
          <details className="mt-1">
            <summary className="cursor-pointer select-none text-neutral-500">Progress per model</summary>
            <ul data-testid="model-suggestion-progress" className="mt-1 space-y-0.5">
              {suggestion.perModelProgress.map((model) => (
                <li key={model.modelId}>
                  {labelFor(model.modelId)}: {model.gradedRuns} of {MIN_GRADED_RUNS_PER_MODEL} graded runs
                  {model.remainingRuns > 0
                    ? ` (needs ${model.remainingRuns} more graded ${model.remainingRuns === 1 ? 'run' : 'runs'})`
                    : ''}
                </li>
              ))}
            </ul>
          </details>
        ) : null}
      </div>
    )
  }

  const parsed = knowledgeItemModelIdSchema.safeParse(suggestion.modelId)
  const alreadyDefault = parsed.success && currentModelId !== undefined && parsed.data === currentModelId

  return (
    <div data-testid="model-suggestion-note" className="mt-3 flex flex-wrap items-center gap-2 text-xs text-neutral-600">
      <p data-testid="model-suggestion-summary">
        Suggested default: {labelFor(suggestion.modelId)} (score {suggestion.score.toFixed(1)}, based on{' '}
        {suggestion.basis.gradedRuns} graded runs across {suggestion.basis.models} models)
      </p>
      {parsed.success && onUse ? (
        <button
          type="button"
          data-testid="model-suggestion-use"
          disabled={disabled || alreadyDefault}
          onClick={() => onUse(parsed.data)}
          className="rounded-md bg-neutral-100 px-3 py-1.5 text-xs font-medium text-neutral-800 hover:bg-neutral-200 disabled:opacity-50"
        >
          {alreadyDefault ? 'Already the default' : 'Use as default'}
        </button>
      ) : null}
    </div>
  )
}
