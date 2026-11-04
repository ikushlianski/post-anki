const EXTRA_CLASS =
  'inline-flex min-h-11 flex-1 items-center justify-center gap-2 rounded-lg border border-neutral-200 bg-white px-3 text-sm font-medium text-neutral-800 hover:bg-neutral-50 disabled:cursor-not-allowed disabled:opacity-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-neutral-900'

export function KnowledgeBitFocusExtraActions({
  bitId,
  chatDisabled,
  exampleDisabled,
  exampleWorking,
  hasAiExample,
  onChat,
  onInbox,
  onExample,
}: {
  bitId: string
  chatDisabled: boolean
  exampleDisabled: boolean
  exampleWorking: boolean
  hasAiExample: boolean
  onChat: () => void
  onInbox?: () => void
  onExample: () => void
}) {
  return (
    <div className="flex gap-3">
      <button
        type="button"
        data-testid={`knowledge-bit-focus-chat-${bitId}`}
        disabled={chatDisabled}
        onClick={onChat}
        className={EXTRA_CLASS}
      >
        Chat about this
        <kbd aria-hidden="true" className="hidden text-neutral-500 sm:inline">C</kbd>
      </button>
      {onInbox ? (
        <button
          type="button"
          data-testid={`knowledge-bit-focus-inbox-${bitId}`}
          disabled={chatDisabled}
          onClick={onInbox}
          className={EXTRA_CLASS}
        >
          Set aside
          <kbd aria-hidden="true" className="hidden text-neutral-500 sm:inline">I</kbd>
        </button>
      ) : null}
      <button
        type="button"
        data-testid={`knowledge-bit-focus-example-${bitId}`}
        disabled={exampleDisabled}
        onClick={onExample}
        className={EXTRA_CLASS}
      >
        {exampleWorking ? (
          <span
            aria-hidden="true"
            data-testid="knowledge-bit-focus-example-spinner"
            className="size-4 animate-spin rounded-full border-2 border-current border-t-transparent motion-reduce:animate-none"
          />
        ) : null}
        {exampleWorking ? 'Writing example' : hasAiExample ? 'New AI example' : 'AI example'}
        <kbd aria-hidden="true" className="hidden text-neutral-500 sm:inline">E</kbd>
      </button>
    </div>
  )
}
