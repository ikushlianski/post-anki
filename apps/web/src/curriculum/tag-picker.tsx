import { useState } from 'react'
import type { FormEvent } from 'react'
import { Link, useRouter } from '@tanstack/react-router'

import type { NodeType, TagChip } from './model'
import { assignTag, createOrGetTag, removeTagAssignment } from './curriculum.api'

export function TagPicker({
  nodeType,
  nodeId,
  tags,
  editable,
}: {
  nodeType: NodeType
  nodeId: string
  tags: TagChip[]
  editable: boolean
}) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [value, setValue] = useState('')
  const [busy, setBusy] = useState(false)

  async function addTag(event: FormEvent) {
    event.preventDefault()

    const trimmed = value.trim()

    if (!trimmed) {
      return
    }

    setBusy(true)
    const tag = await createOrGetTag({ data: { name: trimmed } })
    await assignTag({ data: { tagId: tag.id, nodeType, nodeId } })
    setValue('')
    setOpen(false)
    setBusy(false)
    await router.invalidate()
  }

  async function remove(assignmentId: string, tagId: string) {
    setBusy(true)
    await removeTagAssignment({ data: { tagId, assignmentId } })
    setBusy(false)
    await router.invalidate()
  }

  return (
    <div className="flex flex-wrap items-center gap-1.5" data-testid={`tag-picker-${nodeId}`}>
      {tags.map((tag) => (
        <span
          key={tag.assignmentId}
          data-testid={`tag-chip-${tag.id}`}
          className="flex items-center gap-1 rounded-full bg-indigo-50 px-2 py-0.5 text-xs text-indigo-700"
        >
          <Link
            to="/probe/tag/$tagId"
            params={{ tagId: tag.id }}
            className="hover:underline"
          >
            #{tag.name}
          </Link>
          {editable ? (
            <button
              type="button"
              disabled={busy}
              onClick={() => remove(tag.assignmentId, tag.id)}
              aria-label={`Remove tag ${tag.name}`}
              data-testid={`tag-chip-remove-${tag.id}`}
              className="text-indigo-400 hover:text-indigo-700 disabled:opacity-50"
            >
              ×
            </button>
          ) : null}
        </span>
      ))}

      {editable ? (
        open ? (
          <form onSubmit={addTag} className="flex items-center gap-1">
            <input
              value={value}
              autoFocus
              disabled={busy}
              onChange={(event) => setValue(event.target.value)}
              placeholder="tag name…"
              data-testid={`tag-picker-input-${nodeId}`}
              className="w-24 rounded-md border border-neutral-200 px-2 py-0.5 text-xs outline-none focus:border-neutral-400"
            />
            <button
              type="submit"
              disabled={busy}
              data-testid={`tag-picker-submit-${nodeId}`}
              className="text-xs text-neutral-500 hover:text-neutral-800 disabled:opacity-50"
            >
              add
            </button>
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="text-xs text-neutral-400 hover:text-neutral-700"
            >
              cancel
            </button>
          </form>
        ) : (
          <button
            type="button"
            onClick={() => setOpen(true)}
            data-testid={`tag-picker-open-${nodeId}`}
            className="text-xs text-neutral-400 hover:text-neutral-700"
          >
            + tag
          </button>
        )
      ) : null}
    </div>
  )
}
