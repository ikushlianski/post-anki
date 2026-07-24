import { useState } from 'react'
import type { FormEvent } from 'react'
import { useRouter } from '@tanstack/react-router'

import type { Source } from './model'
import { addSourcesToCurriculum, approveSources, removeSource } from './curriculum.api'

function isValidHttpUrl(value: string): boolean {
  try {
    const parsed = new URL(value)

    return parsed.protocol === 'http:' || parsed.protocol === 'https:'
  } catch {
    return false
  }
}

export function SourceApprovalPanel({
  curriculumId,
  sources,
}: {
  curriculumId: string
  sources: Source[]
}) {
  const router = useRouter()
  const pending = sources.filter((source) => source.approvalStatus === 'pending')
  const [linkValue, setLinkValue] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  async function remove(sourceId: string) {
    setBusy(true)
    await removeSource({ data: sourceId })
    setBusy(false)
    await router.invalidate()
  }

  async function addLink(event: FormEvent) {
    event.preventDefault()

    const trimmed = linkValue.trim()

    if (!isValidHttpUrl(trimmed)) {
      setError('Paste a valid link (starting with http:// or https://).')
      return
    }

    setError(null)
    setBusy(true)
    await addSourcesToCurriculum({
      data: { curriculumId, sources: [{ kind: 'link', value: trimmed }] },
    })
    setLinkValue('')
    setBusy(false)
    await router.invalidate()
  }

  async function approve(override: boolean) {
    setBusy(true)
    await approveSources({ data: { curriculumId, override } })
    setBusy(false)
    await router.invalidate()
  }

  return (
    <div
      data-testid="source-approval-panel"
      className="mb-6 rounded-lg border border-neutral-300 bg-white p-6"
    >
      <h2 className="text-sm font-medium text-neutral-700">
        Review the sources found for this course
      </h2>
      <p className="mt-1 text-sm text-neutral-500">
        Nothing is generated yet. Remove anything you don't trust, add your
        own links, then approve to generate the course.
      </p>

      {pending.length > 0 ? (
        <ul className="mt-4 space-y-2" data-testid="source-candidate-list">
          {pending.map((source) => (
            <li
              key={source.id}
              data-testid="source-candidate-row"
              className="flex items-start justify-between gap-3 rounded-md border border-neutral-200 p-3 text-sm"
            >
              <div className="min-w-0">
                <a
                  href={source.value}
                  target="_blank"
                  rel="noreferrer"
                  className="break-words text-blue-600 underline underline-offset-2"
                >
                  {source.title ?? source.value}
                </a>
                {source.title && source.title !== source.value ? (
                  <p className="mt-0.5 truncate text-xs text-neutral-400">{source.value}</p>
                ) : null}
              </div>
              <button
                type="button"
                onClick={() => remove(source.id)}
                disabled={busy}
                data-testid="source-candidate-remove"
                className="shrink-0 text-neutral-400 hover:text-red-600 disabled:opacity-50"
                aria-label="Remove candidate"
              >
                Remove
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <p
          data-testid="source-approval-empty"
          className="mt-4 rounded-md border border-amber-300 bg-amber-50 p-3 text-sm text-amber-800"
        >
          No trustworthy sources were found (or all were removed).
          Generating without a source is not recommended — the course would
          come from the model's own training data instead of verified
          material.
        </p>
      )}

      <form onSubmit={addLink} className="mt-4 flex gap-2">
        <input
          value={linkValue}
          onChange={(event) => setLinkValue(event.target.value)}
          placeholder="Add your own link — https://…"
          data-testid="source-approval-add-link-input"
          className="flex-1 rounded-md border border-neutral-300 px-3 py-2 text-sm outline-none focus:border-neutral-500"
        />
        <button
          type="submit"
          disabled={busy}
          data-testid="source-approval-add-link-submit"
          className="rounded-md border border-neutral-300 px-3 py-2 text-sm text-neutral-700 hover:border-neutral-500 disabled:opacity-50"
        >
          Add link
        </button>
      </form>
      {error ? <p className="mt-1 text-xs text-red-600">{error}</p> : null}

      <div className="mt-5 flex gap-2">
        {pending.length > 0 ? (
          <button
            type="button"
            onClick={() => approve(false)}
            disabled={busy}
            data-testid="source-approval-approve"
            className="rounded-md bg-neutral-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
          >
            {busy ? 'Generating…' : 'Approve & generate'}
          </button>
        ) : (
          <button
            type="button"
            onClick={() => approve(true)}
            disabled={busy}
            data-testid="source-approval-override"
            className="rounded-md border border-amber-500 px-4 py-2 text-sm font-medium text-amber-700 disabled:opacity-50"
          >
            {busy ? 'Generating…' : 'Generate anyway (ungrounded)'}
          </button>
        )}
      </div>
    </div>
  )
}
