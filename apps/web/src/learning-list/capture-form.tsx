import { useState } from 'react'

import type {
  CaptureLearningListItemInput,
  LearningListItem,
  LearningListItemKind,
} from '@post-anki/shared'

import { captureErrorMessage } from './capture-error'
import type { ApiResult } from './learning-list.model'

export interface CaptureFormProps {
  subjects: Array<{ id: string; name: string }>
  onCapture: (
    input: CaptureLearningListItemInput,
  ) => Promise<ApiResult<LearningListItem>>
  onCaptured: () => void | Promise<void>
}

const KINDS: Array<{ value: LearningListItemKind; label: string }> = [
  { value: 'article', label: 'Article' },
  { value: 'video', label: 'Video' },
]

export function CaptureForm({
  subjects,
  onCapture,
  onCaptured,
}: CaptureFormProps) {
  const [url, setUrl] = useState('')
  const [kind, setKind] = useState<LearningListItemKind>('article')
  const [description, setDescription] = useState('')
  const [subjectId, setSubjectId] = useState(subjects[0]?.id ?? '')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function submit(event: React.FormEvent) {
    event.preventDefault()
    setBusy(true)
    setError(null)

    const trimmed = description.trim()
    const result = await onCapture({
      url: url.trim(),
      kind,
      pastedDescription: trimmed === '' ? null : trimmed,
      subjectId,
      subSubjectNodeId: null,
    })

    setBusy(false)

    if (!result.ok) {
      setError(captureErrorMessage(result.code, result.message))
      return
    }

    setUrl('')
    setDescription('')
    await onCaptured()
  }

  return (
    <form
      onSubmit={submit}
      data-testid="learning-list-capture-form"
      className="rounded-xl border border-neutral-200 bg-white p-5"
    >
      <h2 className="text-sm font-medium">Capture something to learn</h2>
      <p className="mt-0.5 text-xs text-neutral-400">
        An article, a series, or a video plus the description you copied from it.
      </p>

      <div className="mt-3 flex gap-1">
        {KINDS.map((option) => (
          <button
            key={option.value}
            type="button"
            aria-pressed={kind === option.value}
            data-testid={`capture-kind-${option.value}`}
            onClick={() => setKind(option.value)}
            className={`rounded-md px-2.5 py-1 text-xs font-medium ${
              kind === option.value
                ? 'bg-neutral-900 text-white'
                : 'bg-neutral-100 text-neutral-500 hover:bg-neutral-200'
            }`}
          >
            {option.label}
          </button>
        ))}
      </div>

      <label className="mt-3 block text-xs text-neutral-500" htmlFor="capture-url">
        URL
      </label>
      <input
        id="capture-url"
        value={url}
        onChange={(event) => setUrl(event.target.value)}
        placeholder="https://…"
        data-testid="capture-url"
        className="mt-1 w-full rounded-md border border-neutral-300 px-3 py-2 text-sm"
      />

      {kind === 'video' ? (
        <>
          <label
            className="mt-3 block text-xs text-neutral-500"
            htmlFor="capture-description"
          >
            Video description
          </label>
          <textarea
            id="capture-description"
            value={description}
            onChange={(event) => setDescription(event.target.value)}
            rows={4}
            placeholder="Paste the description — it is the source text; no transcript is fetched."
            data-testid="capture-description"
            className="mt-1 w-full rounded-md border border-neutral-300 px-3 py-2 text-sm"
          />
        </>
      ) : null}

      <label
        className="mt-3 block text-xs text-neutral-500"
        htmlFor="capture-subject"
      >
        Subject
      </label>
      <select
        id="capture-subject"
        value={subjectId}
        onChange={(event) => setSubjectId(event.target.value)}
        data-testid="capture-subject"
        className="mt-1 w-full rounded-md border border-neutral-300 px-3 py-2 text-sm"
      >
        {subjects.map((subject) => (
          <option key={subject.id} value={subject.id}>
            {subject.name}
          </option>
        ))}
      </select>

      {error ? (
        <p
          role="alert"
          data-testid="capture-error"
          className="mt-3 rounded-md border border-rose-300 bg-rose-50 px-3 py-2 text-xs text-rose-800"
        >
          {error}
        </p>
      ) : null}

      <button
        type="submit"
        disabled={busy || url.trim() === '' || subjectId === ''}
        data-testid="capture-submit"
        className="mt-4 rounded-md bg-neutral-900 px-3 py-1.5 text-xs font-medium text-white disabled:opacity-50"
      >
        {busy ? 'Capturing…' : 'Capture'}
      </button>
    </form>
  )
}
