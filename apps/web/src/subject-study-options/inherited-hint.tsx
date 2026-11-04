export function InheritedHint({
  source,
  subjectId,
  subjectNames,
  onReset,
  disabled,
  testId,
}: {
  source: string
  subjectId?: string
  subjectNames?: Record<string, string>
  onReset?: () => void
  disabled?: boolean
  testId: string
}) {
  const own = subjectId !== undefined && source === subjectId
  const text = own
    ? 'Set on this subject.'
    : source === 'app'
      ? 'Using the app default.'
      : `Inherited from ${subjectNames?.[source] ?? 'a parent subject'}.`

  return (
    <p data-testid={testId} className="mt-1 text-xs text-neutral-500">
      {text}
      {own && onReset ? (
        <button
          type="button"
          disabled={disabled}
          data-testid={`${testId}-reset`}
          onClick={onReset}
          className="ml-2 underline disabled:opacity-50"
        >
          Use inherited value
        </button>
      ) : null}
    </p>
  )
}
