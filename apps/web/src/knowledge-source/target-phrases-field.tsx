import { TARGET_PHRASES_MAX, TARGET_PHRASE_MAX_CHARS } from '@post-anki/shared'

interface TargetPhrasesFieldProps {
  blockIndex: number
  phrases: string[]
  disabled: boolean
  onChange: (phrases: string[]) => void
}

export function TargetPhrasesField({ blockIndex, phrases, disabled, onChange }: TargetPhrasesFieldProps) {
  return (
    <div
      role="group"
      aria-labelledby={`target-phrases-label-${blockIndex}`}
      data-testid={`target-phrases-field-${blockIndex}`}
      className="w-full max-w-xl space-y-2"
    >
      <p id={`target-phrases-label-${blockIndex}`} className="text-sm font-medium text-neutral-700">
        Target phrases
      </p>

      {phrases.map((phrase, index) => (
        <div key={index} className="flex items-center gap-2">
          <input
            type="text"
            aria-label={`Target phrase ${index + 1}, block ${blockIndex + 1}`}
            value={phrase}
            maxLength={TARGET_PHRASE_MAX_CHARS}
            disabled={disabled}
            onChange={(event) => onChange(phrases.map((current, i) => (i === index ? event.target.value : current)))}
            data-testid={`target-phrase-input-${blockIndex}-${index}`}
            className="min-h-[44px] w-full rounded-md border border-neutral-300 bg-white px-3 py-1.5 text-sm outline-none focus:border-neutral-500 disabled:opacity-50 sm:min-h-0"
          />

          <button
            type="button"
            aria-label={`Remove target phrase ${index + 1}, block ${blockIndex + 1}`}
            disabled={disabled}
            onClick={() => onChange(phrases.filter((_, i) => i !== index))}
            data-testid={`target-phrase-remove-${blockIndex}-${index}`}
            className="text-sm text-neutral-500 hover:text-neutral-900 disabled:opacity-50"
          >
            Remove
          </button>
        </div>
      ))}

      {phrases.length < TARGET_PHRASES_MAX && (
        <button
          type="button"
          disabled={disabled}
          onClick={() => onChange([...phrases, ''])}
          data-testid={`target-phrase-add-button-${blockIndex}`}
          className="inline-flex min-h-[44px] items-center rounded-md border border-neutral-300 px-3 py-1.5 text-sm text-neutral-700 hover:bg-neutral-100 disabled:opacity-50 sm:min-h-0"
        >
          Add target phrase
        </button>
      )}
    </div>
  )
}
