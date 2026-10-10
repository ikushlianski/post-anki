export function AnkiReviewCardActions({
  revealed,
  leech,
  disabled,
  onEdit,
  onBury,
  onSuspend,
}: {
  revealed: boolean
  leech: boolean
  disabled: boolean
  onEdit: () => void
  onBury: () => void
  onSuspend: () => void
}) {
  const button = 'rounded-md border border-neutral-200 px-2 py-1 text-xs disabled:opacity-40'

  return (
    <div data-testid="anki-review-card-actions" className="flex items-center gap-2">
      {leech && (
        <span data-testid="anki-review-leech" role="status" aria-live="polite" className="text-xs font-medium text-amber-700">
          Leech
        </span>
      )}
      {revealed && (
        <button type="button" data-testid="anki-review-edit" disabled={disabled} onClick={onEdit} className={button}>
          Edit <kbd>E</kbd>
        </button>
      )}
      <button
        type="button"
        data-testid="anki-review-bury"
        title="Hide this card until tomorrow"
        disabled={disabled}
        onClick={onBury}
        className={button}
      >
        Bury <kbd>-</kbd>
      </button>
      <button
        type="button"
        data-testid="anki-review-suspend"
        title="Remove this card from reviews until you bring it back"
        disabled={disabled}
        onClick={onSuspend}
        className={button}
      >
        Suspend <kbd>@</kbd>
      </button>
    </div>
  )
}
