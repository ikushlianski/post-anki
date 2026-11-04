import { useState, type FormEvent } from 'react'
import { useQueryClient } from '@tanstack/react-query'

import { deleteTag, renameTag } from '../curriculum/curriculum.api'
import type { Tag } from '../curriculum/model'
import { ActionFailedLine } from '../curriculum/action-failed-line'
import { ConfirmDelete } from '../curriculum/shape-controls'
import { useGuardedRun } from '../curriculum/use-guarded-run'
import { useHydrated } from '../shared/use-hydrated'

export const TAG_NAME_TAKEN_MESSAGE = 'Another tag already has that name'

export function TagRenameControl({ tag }: { tag: Tag }) {
  const queryClient = useQueryClient()
  const { busy, failed, run } = useGuardedRun()
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(tag.name)
  const [nameTaken, setNameTaken] = useState(false)

  function close() {
    setNameTaken(false)
    setEditing(false)
  }

  async function submit(event: FormEvent) {
    event.preventDefault()

    const name = draft.trim()

    if (!name || name === tag.name) {
      close()

      return
    }

    setNameTaken(false)

    await run(async () => {
      const result = await renameTag({ data: { tagId: tag.id, name } })

      if (!result.ok) {
        setNameTaken(true)

        return
      }

      setEditing(false)
      await queryClient.invalidateQueries({ queryKey: ['tags'] })
    })
  }

  if (!editing) {
    return (
      <button
        type="button"
        aria-label={`Rename tag ${tag.name}`}
        data-testid={`tag-list-rename-button-${tag.id}`}
        onClick={() => {
          setDraft(tag.name)
          setEditing(true)
        }}
        className="text-indigo-400 hover:text-indigo-700"
      >
        ✎
      </button>
    )
  }

  return (
    <form onSubmit={submit} className="flex items-center gap-1">
      <input
        value={draft}
        autoFocus
        disabled={busy}
        maxLength={120}
        aria-label={`New name for tag ${tag.name}`}
        data-testid={`tag-list-rename-input-${tag.id}`}
        onChange={(event) => setDraft(event.target.value)}
        className="w-28 rounded-md border border-neutral-200 px-1 py-0.5 text-xs text-neutral-700"
      />
      <button
        type="submit"
        disabled={busy}
        aria-label={`Save name for tag ${tag.name}`}
        data-testid={`tag-list-rename-save-${tag.id}`}
        className="font-medium text-indigo-600 hover:text-indigo-700 disabled:opacity-40"
      >
        ✓
      </button>
      <button
        type="button"
        aria-label="Cancel rename"
        data-testid={`tag-list-rename-cancel-${tag.id}`}
        onClick={close}
        className="text-neutral-400 hover:text-neutral-700"
      >
        ✕
      </button>
      {nameTaken ? (
        <span role="alert" data-testid={`tag-list-rename-taken-${tag.id}`} className="text-xs text-red-600">
          {TAG_NAME_TAKEN_MESSAGE}
        </span>
      ) : null}
      <ActionFailedLine failed={failed} testId={`tag-list-rename-failed-${tag.id}`} />
    </form>
  )
}

export function TagDeleteControl({ tag }: { tag: Tag }) {
  const queryClient = useQueryClient()
  const hydrated = useHydrated()
  const { busy, failed, run } = useGuardedRun()

  return (
    <span className="flex items-center gap-1">
      <ConfirmDelete
        busy={busy}
        hydrated={hydrated}
        label={`Delete tag ${tag.name}`}
        actionLabel="✕"
        consequence="Removes the tag from its cards and topics"
        testId={`tag-list-delete-${tag.id}`}
        onConfirm={() =>
          run(async () => {
            await deleteTag({ data: tag.id })
            await Promise.all([
              queryClient.invalidateQueries({ queryKey: ['tags'] }),
              queryClient.invalidateQueries({ queryKey: ['tags-mastery'] }),
            ])
          })
        }
      />
      <ActionFailedLine failed={failed} testId={`tag-list-delete-failed-${tag.id}`} />
    </span>
  )
}
