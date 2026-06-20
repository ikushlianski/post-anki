export function AdminSettingsToggle({
  label,
  description,
  value,
  onChange,
  disabled,
}: {
  label: string
  description: string
  value: boolean
  onChange: (next: boolean) => void
  disabled?: boolean
}) {
  return (
    <div className="flex items-center justify-between gap-4 rounded-lg border border-neutral-200 bg-white p-4">
      <div className="min-w-0">
        <p className="text-sm font-medium">{label}</p>
        <p className="mt-0.5 text-xs text-neutral-400">{description}</p>
      </div>
      <button
        type="button"
        role="switch"
        aria-checked={value}
        aria-label={label}
        disabled={disabled}
        onClick={() => onChange(!value)}
        className={`shrink-0 rounded-full px-3 py-1 text-xs font-medium disabled:opacity-50 ${
          value
            ? 'bg-emerald-600 text-white'
            : 'bg-neutral-200 text-neutral-600'
        }`}
      >
        {value ? 'On' : 'Off'}
      </button>
    </div>
  )
}
