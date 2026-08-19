import { MODEL_TIER_LABEL, type ModelTier } from '@post-anki/shared'

const TIERS: ModelTier[] = ['cheap', 'balanced', 'premium']

export function ModelTierSelect({
  label,
  description,
  value,
  onChange,
  disabled,
  testId,
}: {
  label: string
  description: string
  value: ModelTier
  onChange: (next: ModelTier) => void
  disabled?: boolean
  testId?: string
}) {
  return (
    <div
      data-testid={testId}
      className="flex items-center justify-between gap-4 rounded-lg border border-neutral-200 bg-white p-4"
    >
      <div className="min-w-0">
        <p className="text-sm font-medium">{label}</p>
        <p className="mt-0.5 text-xs text-neutral-400">{description}</p>
      </div>
      <div className="flex shrink-0 items-center gap-1">
        {TIERS.map((tier) => (
          <button
            key={tier}
            type="button"
            disabled={disabled}
            data-testid={testId ? `${testId}-option-${tier}` : undefined}
            onClick={() => onChange(tier)}
            className={
              value === tier
                ? 'rounded-full bg-emerald-600 px-3 py-1 text-xs font-medium text-white disabled:opacity-50'
                : 'rounded-full px-3 py-1 text-xs font-medium text-neutral-600 hover:text-neutral-900 disabled:opacity-50'
            }
          >
            {MODEL_TIER_LABEL[tier]}
          </button>
        ))}
      </div>
    </div>
  )
}
