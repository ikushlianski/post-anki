import {
  KNOWLEDGE_ITEM_MODELS,
  KNOWLEDGE_ITEM_MODEL_OPTIONS,
  formatKnowledgeItemModelPrice,
  knowledgeItemModelIdSchema,
  type KnowledgeItemModelId,
  type KnowledgeItemModelOption,
} from '@post-anki/shared'

import { SearchableSelect } from '../ui/searchable-select'
import type { SearchableOption } from '../ui/searchable-select'

const DEFAULT_ID = '__default__'

export function describeExtractionModelOption(option: KnowledgeItemModelOption): string {
  const expiry = option.expiresOn ? ` — retires ${option.expiresOn}` : ''

  return `${option.label} — ${formatKnowledgeItemModelPrice(option)}${expiry}`
}

export function ExtractionModelSelect({
  value,
  onChange,
  ariaLabel,
  emptyLabel,
  disabled,
  testId,
  className,
}: {
  value: KnowledgeItemModelId | ''
  onChange: (next: KnowledgeItemModelId | '') => void
  ariaLabel: string
  emptyLabel?: string
  disabled?: boolean
  testId?: string
  className?: string
}) {
  const selected = value === '' ? null : KNOWLEDGE_ITEM_MODELS[value]
  const options: SearchableOption[] = [
    ...(emptyLabel ? [{ id: DEFAULT_ID, label: emptyLabel }] : []),
    ...KNOWLEDGE_ITEM_MODEL_OPTIONS.map((option) => ({
      id: option.id,
      label: describeExtractionModelOption(option),
    })),
  ]

  return (
    <div className="min-w-0 space-y-1">
      <SearchableSelect
        ariaLabel={ariaLabel}
        testId={testId}
        options={options}
        value={value === '' && emptyLabel ? DEFAULT_ID : value}
        disabled={disabled}
        placeholder="Search models…"
        className={className}
        onChange={(id) => {
          const parsed = knowledgeItemModelIdSchema.safeParse(id)

          onChange(parsed.success ? parsed.data : '')
        }}
      />
      {selected ? <p className="text-xs text-neutral-500">{selected.note}</p> : null}
    </div>
  )
}
