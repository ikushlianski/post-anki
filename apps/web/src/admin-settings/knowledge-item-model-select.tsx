import {
  KNOWLEDGE_ITEM_MODELS_CHECKED_ON,
  KNOWLEDGE_ITEM_MODEL_OPTIONS,
  type KnowledgeItemModelId,
} from '@post-anki/shared'

export function KnowledgeItemModelSelect({
  label,
  description,
  value,
  onChange,
  disabled,
  testId,
}: {
  label: string
  description: string
  value: KnowledgeItemModelId
  onChange: (next: KnowledgeItemModelId) => void
  disabled?: boolean
  testId?: string
}) {
  function select(next: KnowledgeItemModelId) {
    if (disabled) {
      return
    }

    onChange(next)
  }

  return (
    <fieldset
      data-testid={testId}
      className="rounded-lg border border-neutral-200 bg-white p-4"
    >
      <legend className="px-1 text-sm font-medium">{label}</legend>
      <p className="mt-0.5 text-xs text-neutral-400">{description}</p>
      <div className="mt-3 space-y-2">
        {KNOWLEDGE_ITEM_MODEL_OPTIONS.map((option) => (
          <label
            key={option.id}
            className="flex cursor-pointer items-start gap-3"
          >
            <input
              type="radio"
              name={testId ?? 'knowledge-item-model'}
              value={option.id}
              checked={value === option.id}
              disabled={disabled}
              onChange={() => select(option.id)}
              data-testid={testId ? `${testId}-option-${option.id}` : undefined}
              className="mt-1"
            />
            <span className="min-w-0">
              <span className="block text-sm font-medium">{option.label}</span>
              <span className="block text-xs text-neutral-600">
                ${option.inputPerMillion} in / ${option.outputPerMillion} out per 1M tokens
              </span>
              <span className="block text-xs text-neutral-400">{option.note}</span>
              {option.expiresOn && (
                <span className="block text-xs font-medium text-amber-700">
                  Expires {option.expiresOn} on OpenRouter
                </span>
              )}
              <span className="block text-xs text-neutral-400">
                Prices checked {KNOWLEDGE_ITEM_MODELS_CHECKED_ON}
              </span>
            </span>
          </label>
        ))}
      </div>
    </fieldset>
  )
}
