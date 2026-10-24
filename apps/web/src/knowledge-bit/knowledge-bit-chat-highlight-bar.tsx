import type { CardTray, TrayField } from './use-card-tray'

const ACTIONS: { field: TrayField; label: string }[] = [
  { field: 'front', label: 'Use as front' },
  { field: 'back', label: 'Use as back' },
  { field: 'example', label: 'Use as example' },
]

const BUTTON_CLASS =
  'min-h-11 flex-1 whitespace-nowrap border-r border-neutral-700 px-3 text-xs font-semibold text-white last:border-r-0 disabled:opacity-50 sm:flex-none sm:text-sm'

export function KnowledgeBitChatHighlightBar({
  selection,
  tray,
  onDone,
}: {
  selection: string
  tray: CardTray
  onDone: () => void
}) {
  if (selection === '') {
    return null
  }

  return (
    <div
      role="toolbar"
      aria-label="Selected text actions"
      data-testid="knowledge-bit-chat-highlight-bar"
      onMouseDown={(event) => event.preventDefault()}
      className="mx-3 mb-2 flex shrink-0 overflow-x-auto rounded-lg bg-neutral-900 shadow-md"
    >
      {ACTIONS.map(({ field, label }) => (
        <button
          key={field}
          type="button"
          data-testid={`knowledge-bit-chat-use-as-${field}`}
          onClick={() => {
            tray.useSelectionAs(field, selection)
            onDone()
          }}
          className={BUTTON_CLASS}
        >
          {label}
        </button>
      ))}
      <button
        type="button"
        data-testid="knowledge-bit-chat-make-fact"
        disabled={tray.makingFact}
        onClick={() => {
          tray.makeFact(selection)
          onDone()
        }}
        className={BUTTON_CLASS}
      >
        Make fact
      </button>
    </div>
  )
}
