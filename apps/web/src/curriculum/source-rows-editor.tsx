import type { SourceKind } from './model'
import type { DraftRow } from './use-source-rows'

export function SourceRowsEditor({
  rows,
  onAdd,
  onUpdate,
  onRemove,
}: {
  rows: DraftRow[]
  onAdd: (kind: SourceKind) => void
  onUpdate: (id: string, value: string) => void
  onRemove: (id: string) => void
}) {
  return (
    <div className="space-y-3">
      {rows.length > 0 ? (
        <div className="space-y-2">
          {rows.map((row) => (
            <SourceInputRow
              key={row.id}
              row={row}
              onChange={(value) => onUpdate(row.id, value)}
              onRemove={() => onRemove(row.id)}
            />
          ))}
        </div>
      ) : null}

      <div className="flex gap-3 text-sm">
        <button
          type="button"
          onClick={() => onAdd('link')}
          className="text-neutral-500 hover:text-neutral-900"
        >
          + Link
        </button>
        <button
          type="button"
          onClick={() => onAdd('text')}
          className="text-neutral-500 hover:text-neutral-900"
        >
          + Pasted text
        </button>
        <span className="text-neutral-300" title="File upload coming later">
          + File (soon)
        </span>
      </div>
    </div>
  )
}

function SourceInputRow({
  row,
  onChange,
  onRemove,
}: {
  row: DraftRow
  onChange: (value: string) => void
  onRemove: () => void
}) {
  return (
    <div className="flex items-start gap-2">
      <span className="mt-2 w-12 shrink-0 text-xs uppercase text-neutral-400">
        {row.kind}
      </span>
      {row.kind === 'link' ? (
        <input
          value={row.value}
          onChange={(event) => onChange(event.target.value)}
          placeholder="https://…"
          className="flex-1 rounded-md border border-neutral-300 px-3 py-2 text-sm outline-none focus:border-neutral-500"
        />
      ) : (
        <textarea
          value={row.value}
          onChange={(event) => onChange(event.target.value)}
          placeholder="Paste text…"
          rows={2}
          className="flex-1 rounded-md border border-neutral-300 px-3 py-2 text-sm outline-none focus:border-neutral-500"
        />
      )}
      <button
        type="button"
        onClick={onRemove}
        className="mt-1 px-1 text-neutral-400 hover:text-neutral-700"
        aria-label="Remove source"
      >
        ×
      </button>
    </div>
  )
}
