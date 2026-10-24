import { formatKnowledgeItemModelPrice } from '@post-anki/shared'

import { fieldClass, type Look } from './lab-field-styles'
import { Listbox, type ListboxItem } from './lab-listbox'
import { MODELS, modelsByVendor, shortPrice } from './lab-data'

interface VariantProps {
  value: string
  onChange: (id: string) => void
  disabled?: boolean
  look: Look
}

export function ModelSelectNativePlain({ value, onChange, disabled, look }: VariantProps) {
  const selected = MODELS.find((option) => option.id === value)

  return (
    <div className="space-y-1">
      <select
        aria-label="Model, plain select"
        value={value}
        disabled={disabled}
        onChange={(event) => onChange(event.target.value)}
        className={fieldClass(look)}
      >
        <option value="">Choose a model</option>
        {MODELS.map((option) => (
          <option key={option.id} value={option.id}>
            {option.label}
          </option>
        ))}
      </select>
      <p className="min-h-4 text-xs text-neutral-500">
        {selected ? `${formatKnowledgeItemModelPrice(selected)}. ${selected.note}` : 'Price shows here once a model is chosen'}
      </p>
    </div>
  )
}

export function ModelSelectNativeGrouped({ value, onChange, disabled, look }: VariantProps) {
  return (
    <select
      aria-label="Model, grouped select"
      value={value}
      disabled={disabled}
      onChange={(event) => onChange(event.target.value)}
      className={fieldClass(look)}
    >
      <option value="">Choose a model</option>
      {modelsByVendor().map((group) => (
        <optgroup key={group.vendor} label={group.vendor}>
          {group.options.map((option) => (
            <option key={option.id} value={option.id}>
              {`${option.label}  ·  ${shortPrice(option)}`}
            </option>
          ))}
        </optgroup>
      ))}
    </select>
  )
}

const MODEL_ITEMS: readonly ListboxItem[] = MODELS.map((option) => ({
  id: option.id,
  label: option.label,
  right: shortPrice(option),
  note: option.expiresOn ? `Retires ${option.expiresOn}` : option.note,
}))

export function ModelSelectListbox({ value, onChange, disabled, look }: VariantProps) {
  return (
    <div className="space-y-1">
      <Listbox
        items={MODEL_ITEMS}
        value={value}
        onChange={onChange}
        placeholder="Choose a model"
        ariaLabel="Model, listbox"
        alignRight
        disabled={disabled}
        look={look}
      />
      <p className="text-xs text-neutral-400">Prices are input / output per 1M tokens</p>
    </div>
  )
}
