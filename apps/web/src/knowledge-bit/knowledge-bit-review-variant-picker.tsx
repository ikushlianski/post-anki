export function KnowledgeBitReviewVariantPicker({
  bitId,
  variantId,
  number,
  label,
  selected,
  disabled,
  onToggle,
}: {
  bitId: string
  variantId: string
  number: number
  label: string
  selected: boolean
  disabled: boolean
  onToggle: () => void
}) {
  return (
    <button
      type="button"
      data-testid={`knowledge-bit-review-pick-${bitId}-${variantId}`}
      aria-pressed={selected}
      disabled={disabled}
      onClick={onToggle}
      className={`flex min-h-11 w-full items-center gap-2 rounded-md px-2 text-left text-xs font-medium disabled:cursor-not-allowed disabled:opacity-50 ${
        selected ? 'bg-neutral-900 text-white' : 'bg-neutral-100 text-neutral-700 hover:bg-neutral-200'
      }`}
    >
      <span className="inline-flex size-5 items-center justify-center rounded-full bg-white/20 tabular-nums">
        {selected ? '✓' : number}
      </span>
      <span>
        {number}. {label}
      </span>
    </button>
  )
}
