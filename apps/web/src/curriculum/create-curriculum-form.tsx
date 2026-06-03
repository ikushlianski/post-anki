import { useState } from 'react'
import type { FormEvent } from 'react'
import { useRouter } from '@tanstack/react-router'

import { createCurriculum } from './curriculum.api'
import { SourceRowsEditor } from './source-rows-editor'
import { useSourceRows } from './use-source-rows'

export function CreateCurriculumForm({ subjectId }: { subjectId: string }) {
  const router = useRouter()
  const sourceRows = useSourceRows()
  const [open, setOpen] = useState(false)
  const [name, setName] = useState('')
  const [busy, setBusy] = useState(false)

  function reset() {
    setName('')
    sourceRows.reset()
    setOpen(false)
  }

  async function submit(event: FormEvent) {
    event.preventDefault()

    if (!name.trim()) {
      return
    }

    setBusy(true)
    await createCurriculum({
      data: { subjectId, name: name.trim(), sources: sourceRows.toDrafts() },
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
        + New curriculum
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
        placeholder="Curriculum name…"
        autoFocus
        className="w-full rounded-md border border-neutral-300 px-3 py-2 text-sm outline-none focus:border-neutral-500"
      />

      <SourceRowsEditor
        rows={sourceRows.rows}
        onAdd={sourceRows.addRow}
        onUpdate={sourceRows.updateRow}
        onRemove={sourceRows.removeRow}
      />

      <div className="flex gap-2 pt-1">
        <button
          type="submit"
          disabled={busy}
          className="rounded-md bg-neutral-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
        >
          Create curriculum
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
