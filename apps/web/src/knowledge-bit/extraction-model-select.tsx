import {
  KNOWLEDGE_ITEM_MODELS,
  KNOWLEDGE_ITEM_MODEL_OPTIONS,
  formatKnowledgeItemModelPrice,
  knowledgeItemModelIdSchema,
  type KnowledgeItemModelId,
  type KnowledgeItemModelOption,
} from '@post-anki/shared'

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

  return (
    <div className="min-w-0 space-y-1">
      <select
        aria-label={ariaLabel}
        data-testid={testId}
        value={value}
        disabled={disabled}
        onChange={(event) => {
          const parsed = knowledgeItemModelIdSchema.safeParse(event.target.value)

          onChange(parsed.success ? parsed.data : '')
        }}
        className={
          className ??
          'w-full rounded-md bg-neutral-100/70 px-2 py-1.5 text-sm text-neutral-900 hover:bg-neutral-100 focus:bg-white focus:outline-2 focus:outline-neutral-300 disabled:opacity-50'
        }
      >
        {emptyLabel ? <option value="">{emptyLabel}</option> : null}
        {KNOWLEDGE_ITEM_MODEL_OPTIONS.map((option) => (
          <option key={option.id} value={option.id}>
            {describeExtractionModelOption(option)}
          </option>
        ))}
      </select>
      {selected ? <p className="text-xs text-neutral-500">{selected.note}</p> : null}
    </div>
  )
}
