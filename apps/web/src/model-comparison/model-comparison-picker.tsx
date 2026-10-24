import {
  KNOWLEDGE_ITEM_MODEL_OPTIONS,
  MODEL_COMPARISON_MAX_MODELS,
  formatKnowledgeItemModelPrice,
  resolveUsableKnowledgeItemModelId,
  type KnowledgeItemModelId,
} from '@post-anki/shared'

export function ModelComparisonPicker({
  selected,
  onChange,
  disabled,
}: {
  selected: readonly KnowledgeItemModelId[]
  onChange: (next: KnowledgeItemModelId[]) => void
  disabled?: boolean
}) {
  const atLimit = selected.length >= MODEL_COMPARISON_MAX_MODELS

  function toggle(id: KnowledgeItemModelId) {
    onChange(selected.includes(id) ? selected.filter((candidate) => candidate !== id) : [...selected, id])
  }

  return (
    <fieldset className="space-y-1" disabled={disabled} data-testid="model-comparison-picker">
      <legend className="mb-1 text-sm font-medium text-neutral-800">
        Models to compare (up to {MODEL_COMPARISON_MAX_MODELS})
      </legend>
      <ul className="grid gap-1 sm:grid-cols-2">
        {KNOWLEDGE_ITEM_MODEL_OPTIONS.filter((option) => resolveUsableKnowledgeItemModelId(option.id) !== null).map(
          (option) => {
            const checked = selected.includes(option.id)

            return (
              <li key={option.id}>
                <label className="flex cursor-pointer items-start gap-2 rounded-md px-2 py-1.5 text-sm hover:bg-neutral-100">
                  <input
                    type="checkbox"
                    checked={checked}
                    disabled={!checked && atLimit}
                    onChange={() => toggle(option.id)}
                    data-testid={`model-comparison-model-${option.id}`}
                    className="mt-1"
                  />
                  <span className="min-w-0">
                    <span className="block font-medium text-neutral-900">{option.label}</span>
                    <span className="block text-xs text-neutral-500">{formatKnowledgeItemModelPrice(option)}</span>
                  </span>
                </label>
              </li>
            )
          },
        )}
      </ul>
    </fieldset>
  )
}
