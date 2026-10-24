import {
  KNOWLEDGE_ITEM_MODELS,
  formatKnowledgeItemModelPrice,
  knowledgeItemModelIdSchema,
  type ModelComparisonModelResult,
} from '@post-anki/shared'
import type { ReactNode } from 'react'

function modelHeading(modelId: string): { label: string; price: string | null } {
  const parsed = knowledgeItemModelIdSchema.safeParse(modelId)

  if (!parsed.success) {
    return { label: modelId, price: null }
  }

  const option = KNOWLEDGE_ITEM_MODELS[parsed.data]

  return { label: option.label, price: formatKnowledgeItemModelPrice(option) }
}

type ResultWithEstimate = ModelComparisonModelResult & { estimatedCostUsd?: number | null }

function formatUsd(value: number): string {
  return `$${value < 0.01 ? value.toFixed(4) : value.toFixed(3)}`
}

function formatTokens(value: number): string {
  return value.toLocaleString('en-US')
}

export function describeActualUsage(result: ResultWithEstimate): string {
  const { inputTokens, outputTokens, actualCostUsd } = result

  if (inputTokens == null || outputTokens == null || actualCostUsd == null) {
    return 'usage not reported'
  }

  const estimate =
    result.estimatedCostUsd == null ? '' : ` (estimate was ${formatUsd(result.estimatedCostUsd)})`

  return `Actual (successful calls): ${formatTokens(inputTokens)} in / ${formatTokens(outputTokens)} out tokens, about ${formatUsd(actualCostUsd)}${estimate}`
}

export function ModelComparisonResults({
  results,
  renderCardExtras,
  renderModelExtras,
}: {
  results: readonly ResultWithEstimate[]
  renderCardExtras?: (modelId: string, cardIndex: number) => ReactNode
  renderModelExtras?: (modelId: string) => ReactNode
}) {
  return (
    <div
      data-testid="model-comparison-results"
      className="grid gap-4 md:grid-cols-2 xl:grid-cols-3"
    >
      {results.map((result) => {
        const heading = modelHeading(result.modelId)

        return (
          <section
            key={result.modelId}
            data-testid={`model-comparison-result-${result.modelId}`}
            className="space-y-3 rounded-xl bg-white p-4 shadow-sm ring-1 ring-neutral-100"
          >
            <header className="space-y-0.5">
              <h3 className="text-base font-semibold text-neutral-900">{heading.label}</h3>
              {heading.price ? <p className="text-xs text-neutral-500">{heading.price}</p> : null}
              <p className="text-xs text-neutral-500">
                {result.status === 'ok'
                  ? `${result.cards.length} of ${result.returned} cards kept · ${(result.ms / 1000).toFixed(1)} s`
                  : 'Failed'}
              </p>
              {result.status === 'ok' ? (
                <p className="text-xs text-neutral-500" data-testid={`model-comparison-usage-${result.modelId}`}>
                  {describeActualUsage(result)}
                </p>
              ) : null}
            </header>

            {result.status === 'failed' ? (
              <p role="alert" className="rounded-md bg-red-50 px-3 py-2 text-xs text-red-700">
                {result.error ?? 'No result'}
              </p>
            ) : (
              <ol className="space-y-3">
                {result.cards.map((card, index) => (
                  <li key={`${card.question}-${index}`} className="space-y-1.5 rounded-lg bg-neutral-50 p-3">
                    <p className="text-sm font-semibold text-neutral-900">{card.question}</p>
                    <p className="text-sm text-neutral-700">{card.answer}</p>
                    {renderCardExtras?.(result.modelId, index)}
                  </li>
                ))}
              </ol>
            )}

            {result.dropped.length > 0 ? (
              <p className="text-xs text-neutral-500" data-testid={`model-comparison-dropped-${result.modelId}`}>
                Dropped by checks: {result.dropped.join(', ')}
              </p>
            ) : null}

            {renderModelExtras?.(result.modelId)}
          </section>
        )
      })}
    </div>
  )
}
