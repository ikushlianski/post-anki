import { useState } from 'react'
import type { FormEvent } from 'react'
import { useRouter } from '@tanstack/react-router'

import { addSourcesToCurriculum } from './curriculum.api'
import { SourceRowsEditor } from './source-rows-editor'
import { useSourceRows } from './use-source-rows'

export function AddSourcesForm({ curriculumId }: { curriculumId: string }) {
  const router = useRouter()
  const sourceRows = useSourceRows()
  const [open, setOpen] = useState(false)
  const [busy, setBusy] = useState(false)

  function reset() {
    sourceRows.reset()
    setOpen(false)
  }

  async function submit(event: FormEvent) {
    event.preventDefault()

    const drafts = sourceRows.toDrafts()

    if (drafts.length === 0) {
      return
    }

    setBusy(true)
    await addSourcesToCurriculum({ data: { curriculumId, sources: drafts } })
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
        + Add sources
      </button>
    )
  }

  return (
    <form
      onSubmit={submit}
      className="mt-2 space-y-3 rounded-lg border border-neutral-200 bg-white p-4"
    >
      <SourceRowsEditor
        rows={sourceRows.rows}
        onAdd={sourceRows.addRow}
        onUpdate={sourceRows.updateRow}
        onRemove={sourceRows.removeRow}
      />

      <div className="flex gap-2">
        <button
          type="submit"
          disabled={busy}
          className="rounded-md bg-neutral-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
        >
          Add sources
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
