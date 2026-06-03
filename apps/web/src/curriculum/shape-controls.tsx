import { useState } from 'react'
import type { FormEvent } from 'react'

export function moveInOrder(
  ids: string[],
  id: string,
  direction: 'up' | 'down',
): string[] {
  const index = ids.indexOf(id)

  if (index === -1) {
    return ids
  }

  const target = direction === 'up' ? index - 1 : index + 1

  if (target < 0 || target >= ids.length) {
    return ids
  }

  const next = [...ids]

  ;[next[index], next[target]] = [next[target]!, next[index]!]

  return next
}

export function ReorderButtons({
  canUp,
  canDown,
  busy,
  onMove,
}: {
  canUp: boolean
  canDown: boolean
  busy: boolean
  onMove: (direction: 'up' | 'down') => void
}) {
  return (
    <span className="flex flex-col leading-none">
      <button
        type="button"
        aria-label="Move up"
        disabled={busy || !canUp}
        onClick={() => onMove('up')}
        className="text-[10px] text-neutral-400 hover:text-neutral-800 disabled:opacity-30"
      >
        ▲
      </button>
      <button
        type="button"
        aria-label="Move down"
        disabled={busy || !canDown}
        onClick={() => onMove('down')}
        className="text-[10px] text-neutral-400 hover:text-neutral-800 disabled:opacity-30"
      >
        ▼
      </button>
    </span>
  )
}

export function InlineRename({
  value,
  busy,
  onSave,
}: {
  value: string
  busy: boolean
  onSave: (next: string) => void
}) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(value)

  function submit(event: FormEvent) {
    event.preventDefault()

    const trimmed = draft.trim()

    if (trimmed && trimmed !== value) {
      onSave(trimmed)
    }

    setEditing(false)
  }

  if (!editing) {
    return (
      <button
        type="button"
        title="Rename"
        onClick={() => {
          setDraft(value)
          setEditing(true)
        }}
        className="text-left hover:underline decoration-dotted underline-offset-4"
      >
        {value}
      </button>
    )
  }

  return (
    <form onSubmit={submit} className="inline-flex items-center gap-1">
      <input
        value={draft}
        autoFocus
        disabled={busy}
        onChange={(event) => setDraft(event.target.value)}
        onBlur={submit}
        className="rounded border border-neutral-300 px-1.5 py-0.5 text-sm outline-none focus:border-neutral-500"
      />
    </form>
  )
}

export function ConfirmDelete({
  busy,
  label,
  onConfirm,
}: {
  busy: boolean
  label: string
  onConfirm: () => void
}) {
  const [armed, setArmed] = useState(false)

  if (!armed) {
    return (
      <button
        type="button"
        title={label}
        disabled={busy}
        onClick={() => setArmed(true)}
        className="text-xs text-neutral-400 hover:text-red-600 disabled:opacity-40"
      >
        Delete
      </button>
    )
  }

  return (
    <span className="flex items-center gap-1 text-xs">
      <button
        type="button"
        disabled={busy}
        onClick={onConfirm}
        className="font-medium text-red-600 hover:text-red-700 disabled:opacity-40"
      >
        Confirm
      </button>
      <button
        type="button"
        onClick={() => setArmed(false)}
        className="text-neutral-400 hover:text-neutral-700"
      >
        cancel
      </button>
    </span>
  )
}

export function AddInline({
  cta,
  placeholder,
  busy,
  onAdd,
}: {
  cta: string
  placeholder: string
  busy: boolean
  onAdd: (value: string) => void
}) {
  const [open, setOpen] = useState(false)
  const [value, setValue] = useState('')

  function submit(event: FormEvent) {
    event.preventDefault()

    const trimmed = value.trim()

    if (!trimmed) {
      return
    }

    onAdd(trimmed)
    setValue('')
    setOpen(false)
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="text-sm text-neutral-500 hover:text-neutral-900"
      >
        {cta}
      </button>
    )
  }

  return (
    <form onSubmit={submit} className="flex gap-2">
      <input
        value={value}
        autoFocus
        disabled={busy}
        onChange={(event) => setValue(event.target.value)}
        placeholder={placeholder}
        className="flex-1 rounded-md border border-neutral-300 px-2 py-1 text-sm outline-none focus:border-neutral-500"
      />
      <button
        type="submit"
        disabled={busy}
        className="rounded-md bg-neutral-900 px-3 py-1 text-sm font-medium text-white disabled:opacity-50"
      >
        Add
      </button>
      <button
        type="button"
        onClick={() => setOpen(false)}
        className="rounded-md px-2 py-1 text-sm text-neutral-500 hover:text-neutral-900"
      >
        Cancel
      </button>
    </form>
  )
}
