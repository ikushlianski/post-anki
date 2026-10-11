import { useState } from 'react'
import { SubjectCombobox } from '../ui/subject-combobox'

import type { ApiResult } from './learning-list.model'

export interface ClassifyActionProps {
  itemId: string
  subjects: Array<{ id: string; name: string }>
  onClassify: (input: {
    itemId: string
    subjectId: string
    subSubjectNodeId: string | null
  }) => Promise<ApiResult<unknown>>
  onClassified: () => void | Promise<void>
}

export function ClassifyAction({
  itemId,
  subjects,
  onClassify,
  onClassified,
}: ClassifyActionProps) {
  const [subjectId, setSubjectId] = useState(subjects[0]?.id ?? '')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function classify() {
    setBusy(true)
    setError(null)

    const result = await onClassify({ itemId, subjectId, subSubjectNodeId: null })

    setBusy(false)

    if (!result.ok) {
      setError(`Classification did not run (${result.code}).`)
      return
    }

    await onClassified()
  }

  return (
    <div
      data-testid="classify-action"
      className="mt-3 alert alert-info"
    >
      <p className="text-sm text-neutral-700">
        Discovered as part of a series but never read yet — pick a subject
        and classify it to see what to do with it.
      </p>

      <div className="mt-3 flex items-center gap-2">
        <SubjectCombobox
          ariaLabel="Subject to classify under"
          options={subjects.map((subject) => ({ id: subject.id, label: subject.name }))}
          value={subjectId}
          onChange={setSubjectId}
          testId="classify-action-subject"
          className="rounded-md border border-sky-300 bg-white px-3 py-1.5 text-xs"
        />
        <button
          type="button"
          disabled={busy || subjectId === ''}
          onClick={() => void classify()}
          data-testid="classify-action-submit"
          className="rounded-md bg-sky-700 px-3 py-1.5 text-xs font-medium text-white disabled:opacity-50"
        >
          {busy ? 'Classifying…' : 'Classify'}
        </button>
      </div>

      {error ? (
        <p
          role="alert"
          data-testid="classify-action-error"
          className="mt-2 text-xs text-rose-700"
        >
          {error}
        </p>
      ) : null}
    </div>
  )
}
