import { useState } from 'react'
import type { FormEvent } from 'react'
import { useRouter } from '@tanstack/react-router'

import { createSubject } from './subject.api'

export function CreateSubjectForm() {
  const router = useRouter()
  const [name, setName] = useState('')
  const [busy, setBusy] = useState(false)

  async function submit(event: FormEvent) {
    event.preventDefault()

    if (!name.trim()) {
      return
    }

    setBusy(true)
    await createSubject({ data: { name: name.trim() } })
    setName('')
    setBusy(false)
    await router.invalidate()
  }

  return (
    <form onSubmit={submit} className="flex gap-2">
      <input
        value={name}
        onChange={(event) => setName(event.target.value)}
        placeholder="New subject…"
        className="flex-1 rounded-md border border-neutral-300 bg-white px-3 py-2 text-sm outline-none focus:border-neutral-500"
      />
      <button
        type="submit"
        disabled={busy}
        className="rounded-md bg-neutral-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
      >
        Add subject
      </button>
    </form>
  )
}
