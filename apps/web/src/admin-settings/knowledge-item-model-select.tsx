import { KNOWLEDGE_ITEM_MODELS_CHECKED_ON, type KnowledgeItemModelId } from '@post-anki/shared'

import { ExtractionModelSelect } from '../knowledge-bit/extraction-model-select'

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
  return (
    <fieldset data-testid={testId} className="rounded-lg bg-neutral-50 p-4">
      <legend className="px-1 text-sm font-medium">{label}</legend>
      <p className="mt-0.5 text-xs text-neutral-400">{description}</p>
      <div className="mt-3 max-w-xl">
        <ExtractionModelSelect
          ariaLabel={label}
          value={value}
          disabled={disabled}
          testId={testId ? `${testId}-select` : undefined}
          onChange={(next) => {
            if (next !== '') {
              onChange(next)
            }
          }}
        />
      </div>
      <p className="mt-2 text-xs text-neutral-400">Prices checked {KNOWLEDGE_ITEM_MODELS_CHECKED_ON}</p>
    </fieldset>
  )
}
