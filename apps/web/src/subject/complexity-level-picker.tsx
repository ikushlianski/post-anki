import type { ComplexityLevel } from '@post-anki/shared'

export type ComplexityChoice = ComplexityLevel | 'inherit'

export function complexityInput(
  choice: ComplexityChoice,
  hasParent: boolean,
): { complexityLevel?: ComplexityLevel } {
  if (choice === 'inherit' || (choice === 'normal' && !hasParent)) {
    return {}
  }

  return { complexityLevel: choice }
}

export function ComplexityLevelPicker({
  value,
  onChange,
  allowInherit,
  disabled,
  testId,
}: {
  value: ComplexityChoice
  onChange: (next: ComplexityChoice) => void
  allowInherit: boolean
  disabled?: boolean
  testId: string
}) {
  return (
    <select
      value={value}
      disabled={disabled}
      aria-label="Complexity level"
      data-testid={testId}
      onChange={(event) => onChange(event.target.value as ComplexityChoice)}
      className="w-full rounded-md border border-neutral-300 bg-white px-3 py-2 text-sm outline-none focus:border-neutral-500"
    >
      {allowInherit ? <option value="inherit">Complexity: inherit from parent</option> : null}
      <option value="easy">Complexity: Easy (wider gaps)</option>
      <option value="normal">Complexity: Normal</option>
      <option value="cram">Complexity: Cram (tighter gaps)</option>
    </select>
  )
}
