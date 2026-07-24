import { useState } from 'react'
import type { FormEvent } from 'react'

export function NodeCommentControl({
  busy,
  onSubmit,
}: {
  busy: boolean
  onSubmit: (comment: string) => Promise<void>
}) {
  const [open, setOpen] = useState(false)
  const [value, setValue] = useState('')
  const [saved, setSaved] = useState(false)

  async function submit(event: FormEvent) {
    event.preventDefault()

    const trimmed = value.trim()

    if (!trimmed) {
      return
    }

    await onSubmit(trimmed)
    setValue('')
    setOpen(false)
    setSaved(true)
    setTimeout(() => setSaved(false), 2000)
  }

  if (saved) {
    return <span className="text-xs text-emerald-600">Comment saved</span>
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="text-xs text-neutral-400 hover:text-neutral-700"
      >
        💬 Leave a comment
      </button>
    )
  }

  return (
    <form onSubmit={submit} className="flex min-w-[10rem] flex-1 gap-2">
      <input
        value={value}
        autoFocus
        disabled={busy}
        onChange={(event) => setValue(event.target.value)}
        placeholder="A note for later — not sent to any AI…"
        className="flex-1 rounded-md border border-neutral-200 px-2 py-1 text-xs outline-none focus:border-neutral-400"
      />
      <button
        type="submit"
        disabled={busy}
        className="rounded-md border border-neutral-300 px-2 py-1 text-xs text-neutral-600 hover:border-neutral-500 disabled:opacity-50"
      >
        Save
      </button>
      <button
        type="button"
        onClick={() => setOpen(false)}
        className="text-xs text-neutral-400 hover:text-neutral-700"
      >
        Cancel
      </button>
    </form>
  )
}
