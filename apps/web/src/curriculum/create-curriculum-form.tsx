import { useState } from 'react'
import type { FormEvent } from 'react'

import { ActionFailedLine } from './action-failed-line'
import { createCurriculum } from './curriculum.api'
import { SourceRowsEditor } from './source-rows-editor'
import { useGuardedRun } from './use-guarded-run'
import { useSourceRows } from './use-source-rows'

export function CreateCurriculumForm({
  subjectId,
  requireSources = false,
  domainNodeId,
  toggleLabel = '+ New curriculum',
  toggleTestId = 'curriculum-create-toggle',
  toggleClassName = 'text-sm text-neutral-500 hover:text-neutral-900',
}: {
  subjectId: string
  requireSources?: boolean
  // Explicit domain-tree placement — set when this form is rendered inline
  // under a domain-map tree node's "add course here" affordance (SCENARIO 3).
  // Passed straight through to createCurriculum's data; undefined everywhere
  // else, which resolveDomainPlacement() reads the same as "no explicit
  // placement given".
  domainNodeId?: string | null
  toggleLabel?: string
  toggleTestId?: string
  toggleClassName?: string
}) {
  const { busy, failed, run } = useGuardedRun()
  const sourceRows = useSourceRows()
  const [open, setOpen] = useState(false)
  const [name, setName] = useState('')

  function reset() {
    setName('')
    sourceRows.reset()
    setOpen(false)
  }

  const drafts = sourceRows.toDrafts()
  const sourceMandateUnmet = requireSources && drafts.length === 0

  async function submit(event: FormEvent) {
    event.preventDefault()

    if (!name.trim() || sourceMandateUnmet) {
      return
    }

    await run(async () => {
      await createCurriculum({
        data: { subjectId, name: name.trim(), sources: drafts, domainNodeId },
      })
      reset()
    })
  }

  if (!open) {
    return (
      <button
        type="button"
        data-testid={toggleTestId}
        onClick={() => setOpen(true)}
        className={toggleClassName}
      >
        {toggleLabel}
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
        aria-label="Curriculum name"
        placeholder="Curriculum name…"
        autoFocus
        data-testid="curriculum-name-input"
        className="w-full rounded-md border border-neutral-300 px-3 py-2 text-sm outline-none focus:border-neutral-500"
      />

      <SourceRowsEditor
        rows={sourceRows.rows}
        onAdd={sourceRows.addRow}
        onUpdate={sourceRows.updateRow}
        onRemove={sourceRows.removeRow}
      />

      {sourceMandateUnmet ? (
        <p className="text-xs text-amber-700" data-testid="curriculum-sources-required">
          This subject requires at least one source before a curriculum can be created.
        </p>
      ) : null}

      <div className="flex gap-2 pt-1">
        <button
          type="submit"
          disabled={busy || sourceMandateUnmet}
          data-testid="curriculum-create-submit"
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
        <ActionFailedLine failed={failed} testId="curriculum-create-error" />
      </div>
    </form>
  )
}
