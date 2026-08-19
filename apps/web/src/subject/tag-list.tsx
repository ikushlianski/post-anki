import { useState } from 'react'
import { Link } from '@tanstack/react-router'
import { useQuery, useQueryClient } from '@tanstack/react-query'

import { listTags, mergeTags } from '../curriculum/curriculum.api'
import type { Tag } from '../curriculum/model'

function TagMergeControl({
  tag,
  allTags,
  onMerged,
}: {
  tag: Tag
  allTags: Tag[]
  onMerged: () => void
}) {
  const [armed, setArmed] = useState(false)
  const [busy, setBusy] = useState(false)
  const [targetTagId, setTargetTagId] = useState('')

  const options = allTags.filter((candidate) => candidate.id !== tag.id)

  async function confirm() {
    if (!targetTagId) {
      return
    }

    setBusy(true)
    await mergeTags({ data: { targetTagId, sourceTagId: tag.id } })
    setBusy(false)
    setArmed(false)
    onMerged()
  }

  if (!armed) {
    return (
      <button
        type="button"
        data-testid={`tag-list-merge-button-${tag.id}`}
        onClick={() => setArmed(true)}
        className="text-indigo-400 hover:text-indigo-700"
        aria-label={`Merge tag ${tag.name}`}
      >
        ⇄
      </button>
    )
  }

  return (
    <span className="flex items-center gap-1">
      <select
        data-testid={`tag-list-merge-target-select-${tag.id}`}
        value={targetTagId}
        onChange={(event) => setTargetTagId(event.target.value)}
        className="rounded-md border border-neutral-200 px-1 py-0.5 text-xs text-neutral-700"
      >
        <option value="">merge into…</option>
        {options.map((option) => (
          <option key={option.id} value={option.id}>
            {option.name}
          </option>
        ))}
      </select>
      <button
        type="button"
        disabled={busy || !targetTagId}
        data-testid={`tag-list-merge-confirm-${tag.id}`}
        onClick={confirm}
        className="font-medium text-indigo-600 hover:text-indigo-700 disabled:opacity-40"
      >
        ✓
      </button>
      <button
        type="button"
        data-testid={`tag-list-merge-cancel-${tag.id}`}
        onClick={() => setArmed(false)}
        className="text-neutral-400 hover:text-neutral-700"
      >
        ✕
      </button>
    </span>
  )
}

export function TagList() {
  const queryClient = useQueryClient()
  const { data: tags } = useQuery({
    queryKey: ['tags'],
    queryFn: () => listTags(),
  })

  if (!tags || tags.length === 0) {
    return null
  }

  return (
    <div className="mb-10" data-testid="tag-list">
      <h2 className="mb-2 text-xs font-medium uppercase tracking-wide text-neutral-400">
        Cross-cutting tags
      </h2>
      <div className="flex flex-wrap gap-2">
        {tags.map((tag) => (
          <span
            key={tag.id}
            className="flex items-center gap-1.5 rounded-full bg-indigo-50 px-3 py-1 text-sm text-indigo-700"
          >
            <Link
              to="/probe/tag/$tagId"
              params={{ tagId: tag.id }}
              data-testid={`tag-list-item-${tag.id}`}
              className="hover:underline"
            >
              #{tag.name}
            </Link>
            <TagMergeControl
              tag={tag}
              allTags={tags}
              onMerged={() => queryClient.invalidateQueries({ queryKey: ['tags'] })}
            />
          </span>
        ))}
      </div>
    </div>
  )
}
