import { useState } from 'react'
import type { FormEvent } from 'react'
import { useRouter } from '@tanstack/react-router'

import { createSubject } from './subject.api'

export function CreateSubjectForm() {
  const router = useRouter()
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [requireSources, setRequireSources] = useState(false)
  const [busy, setBusy] = useState(false)

  async function submit(event: FormEvent) {
    event.preventDefault()

    if (!name.trim()) {
      return
    }

    setBusy(true)
    await createSubject({
      data: {
        name: name.trim(),
        description: description.trim() || undefined,
        requireSources,
      },
    })
    setName('')
    setDescription('')
    setRequireSources(false)
    setBusy(false)
    await router.invalidate()
  }

  return (
    <form
      onSubmit={submit}
      className="space-y-2"
      data-testid="subject-create-form"
    >
      <div className="flex gap-2">
        <input
          value={name}
          onChange={(event) => setName(event.target.value)}
          placeholder="New subject…"
          data-testid="subject-name-input"
          className="flex-1 rounded-md border border-neutral-300 bg-white px-3 py-2 text-sm outline-none focus:border-neutral-500"
        />
        <button
          type="submit"
          disabled={busy}
          data-testid="subject-add-button"
          className="rounded-md bg-neutral-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
        >
          Add subject
        </button>
      </div>

      <textarea
        value={description}
        onChange={(event) => setDescription(event.target.value)}
        placeholder="What is this subject about? (optional — gives the AI more context)"
        rows={2}
        data-testid="subject-description-input"
        className="w-full resize-none rounded-md border border-neutral-300 bg-white px-3 py-2 text-sm outline-none focus:border-neutral-500"
      />

      <label className="flex items-center gap-2 text-sm text-neutral-600">
        <input
          type="checkbox"
          checked={requireSources}
          onChange={(event) => setRequireSources(event.target.checked)}
          data-testid="subject-require-sources-input"
        />
        Require sources for every curriculum in this subject
      </label>
    </form>
  )
}
