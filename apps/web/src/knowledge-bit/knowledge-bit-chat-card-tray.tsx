import type { CardTray, TrayField } from './use-card-tray'
import { TRAY_LIMITS } from './use-card-tray'

const FIELDS: { field: TrayField; label: string; placeholder: string; rows: number }[] = [
  { field: 'front', label: 'Front', placeholder: 'Select text and tap Use as front', rows: 2 },
  { field: 'back', label: 'Back', placeholder: 'Select text and tap Use as back', rows: 3 },
  {
    field: 'example',
    label: 'Example',
    placeholder: 'Optional. Select text and tap Use as example',
    rows: 2,
  },
]

const BUTTON_CLASS = 'min-h-11 flex-1 rounded-md px-4 text-sm font-medium disabled:opacity-50'

export function KnowledgeBitChatCardTray({ tray }: { tray: CardTray }) {
  const { fields, open, filledCount } = tray

  return (
    <div
      data-testid="knowledge-bit-chat-tray"
      className="shrink-0 border-t border-neutral-200 bg-neutral-50 px-3 py-1"
    >
      <button
        type="button"
        data-testid="knowledge-bit-chat-tray-toggle"
        aria-expanded={open}
        onClick={() => tray.setOpen(!open)}
        className="flex min-h-11 w-full items-center justify-between text-left text-sm font-semibold text-neutral-700"
      >
        <span>{`Card tray (${filledCount} of 3 filled)`}</span>
        <span aria-hidden="true">{open ? '▾' : '▴'}</span>
      </button>

      {tray.saved ? (
        <p data-testid="knowledge-bit-chat-tray-saved" className="pb-2 text-sm text-green-700">
          Saved, waiting in review
        </p>
      ) : null}

      {open ? (
        <div className="max-h-[40dvh] space-y-2 overflow-y-auto pb-2">
          {FIELDS.map(({ field, label, placeholder, rows }) => (
            <label key={field} className="block text-xs uppercase tracking-wide text-neutral-400">
              {label}
              <textarea
                data-testid={`knowledge-bit-chat-tray-${field}`}
                rows={rows}
                maxLength={TRAY_LIMITS[field]}
                value={fields[field]}
                placeholder={placeholder}
                disabled={tray.saving}
                onChange={(event) => tray.setField(field, event.target.value)}
                className="mt-1 min-h-11 w-full rounded-md border border-neutral-300 bg-white p-2 text-base normal-case tracking-normal text-neutral-800 sm:text-sm"
              />
            </label>
          ))}
          {tray.makingFact ? (
            <p className="text-xs text-neutral-500">Writing the front…</p>
          ) : null}
          {tray.factFailed ? (
            <p role="alert" className="text-xs text-red-600">
              Could not write a front — type one yourself.
            </p>
          ) : null}
          {tray.saveFailed ? (
            <p role="alert" data-testid="knowledge-bit-chat-tray-error" className="text-xs text-red-600">
              Could not save the card — try again.
            </p>
          ) : null}
          <div className="flex gap-2">
            <button
              type="button"
              data-testid="knowledge-bit-chat-tray-clear"
              disabled={tray.saving}
              onClick={tray.clear}
              className={`${BUTTON_CLASS} border border-neutral-300 text-neutral-700`}
            >
              Clear
            </button>
            <button
              type="button"
              data-testid="knowledge-bit-chat-tray-create"
              disabled={!tray.canCreate || tray.saving}
              onClick={tray.create}
              className={`${BUTTON_CLASS} bg-neutral-900 text-white`}
            >
              {tray.saving ? 'Saving…' : 'Create card'}
            </button>
          </div>
        </div>
      ) : null}
    </div>
  )
}
