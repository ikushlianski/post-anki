import { useState } from 'react'
import type { FormEvent } from 'react'
import { useRouter } from '@tanstack/react-router'

import { createCurriculum } from './curriculum.api'

export function StudyTechnologyForm({ subjectId }: { subjectId: string }) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [name, setName] = useState('')
  const [busy, setBusy] = useState(false)

  function reset() {
    setName('')
    setOpen(false)
  }

  async function submit(event: FormEvent) {
    event.preventDefault()

    const trimmed = name.trim()

    if (!trimmed) {
      return
    }

    setBusy(true)
    await createCurriculum({
      data: { subjectId, name: trimmed, sources: [], researchTopic: trimmed },
    })
    setBusy(false)
    reset()
    await router.invalidate()
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="text-sm text-neutral-500 hover:text-neutral-900"
      >
        🔎 Study a technology
      </button>
    )
  }

  return (
    <form
      onSubmit={submit}
      className="space-y-3 rounded-lg border border-neutral-200 bg-white p-4"
    >
      <input
        value={name}
        onChange={(event) => setName(event.target.value)}
        placeholder="Technology name — e.g. Temporal…"
        autoFocus
        className="w-full rounded-md border border-neutral-300 px-3 py-2 text-sm outline-none focus:border-neutral-500"
      />
      <p className="text-xs text-neutral-400">
        No sources needed — the mentor researches this technology and
        proposes a leveled map for you to pick a slice from.
      </p>

      <div className="flex gap-2 pt-1">
        <button
          type="submit"
          disabled={busy}
          className="rounded-md bg-neutral-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
        >
          {busy ? 'Starting research…' : 'Study this'}
        </button>
        <button
          type="button"
          onClick={reset}
          className="rounded-md px-4 py-2 text-sm text-neutral-500 hover:text-neutral-900"
        >
          Cancel
        </button>
      </div>
    </form>
  )
}
