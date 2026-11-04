import { AiLabelBadge } from './ai-label-badge'

export function AiSuggestionBlock({
  original,
  aiSuggestion,
  testIdSuffix = '',
}: {
  original: string
  aiSuggestion: string | null | undefined
  testIdSuffix?: string
}) {
  if (!aiSuggestion) {
    return null
  }

  return (
    <div
      data-testid={`ai-suggestion-block${testIdSuffix}`}
      className="space-y-1 rounded-md border border-indigo-100 bg-indigo-50/40 px-3 py-2 text-sm"
    >
      <p>
        <span className="font-medium text-neutral-500">Your phrase: </span>
        <span data-testid={`ai-suggestion-original${testIdSuffix}`}>{original}</span>
      </p>
      <div className="flex flex-wrap items-center gap-2">
        <AiLabelBadge isAiGenerated testIdSuffix={`-suggestion${testIdSuffix}`} />
        <p>
          <span className="font-medium text-neutral-500">AI suggestion: </span>
          <span data-testid={`ai-suggestion-text${testIdSuffix}`}>{aiSuggestion}</span>
        </p>
      </div>
    </div>
  )
}
