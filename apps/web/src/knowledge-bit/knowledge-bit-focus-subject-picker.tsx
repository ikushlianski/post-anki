import { useState } from 'react'

import type { ComplexityLevel } from '@post-anki/shared'

import { createSubject } from '../subject/subject.api'
import { SearchableSelect } from '../ui/searchable-select'
import { NewSubjectForm } from '../subject/new-subject-form'
import { SECONDARY_BUTTON_CLASS } from './knowledge-bit-review-classes'
import { moveKnowledgeBitToSubjectForReview } from './knowledge-bit-subject-move.api'
import { useKnowledgeOverviewSubjects } from './use-knowledge-overview-subjects'

const PATH_SEPARATOR = ' › '

interface KnowledgeBitFocusSubjectPickerProps {
  bitId: string
  subjectName: string | null
  onChanged: (subjectName: string) => void
}

export function KnowledgeBitFocusSubjectPicker({
  bitId,
  subjectName,
  onChanged,
}: KnowledgeBitFocusSubjectPickerProps) {
  const [open, setOpen] = useState(false)

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2">
        <p
          data-testid="knowledge-bit-focus-subject"
          className="text-xs font-medium uppercase tracking-wide text-neutral-500"
        >
          {subjectName ?? 'No subject'}
        </p>
        <button
          type="button"
          data-testid="knowledge-bit-focus-subject-change"
          aria-expanded={open}
          onClick={() => setOpen((value) => !value)}
          className="min-h-11 text-xs font-medium text-neutral-500 hover:text-neutral-900 sm:min-h-8"
        >
          {open ? 'Close' : 'Change'}
        </button>
      </div>
      {open ? (
        <SubjectPickerPanel
          bitId={bitId}
          onChanged={(name) => {
            onChanged(name)
            setOpen(false)
          }}
        />
      ) : null}
    </div>
  )
}

function SubjectPickerPanel({
  bitId,
  onChanged,
}: {
  bitId: string
  onChanged: (subjectName: string) => void
}) {
  const { options, labelFor } = useKnowledgeOverviewSubjects()
  const [creating, setCreating] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function assign(subjectId: string, label: string) {
    const result = await moveKnowledgeBitToSubjectForReview({ data: { bitId, subjectId } })

    if (!result.moved.includes(bitId)) {
      throw new Error('not_moved')
    }

    onChanged(label)
  }

  async function run(action: () => Promise<void>) {
    setBusy(true)
    setError(null)

    try {
      await action()
    } catch {
      setError("Couldn't change the subject — try again.")
    } finally {
      setBusy(false)
    }
  }

  function pick(subjectId: string) {
    void run(() => assign(subjectId, labelFor(subjectId)))
  }

  function create({ name, parentId, complexityLevel }: { name: string; parentId: string | null; complexityLevel?: ComplexityLevel }) {
    void run(async () => {
      const created = await createSubject({
        data: { name, kind: 'architecture-mentor', parentId, complexityLevel },
      })
      const parentLabel = parentId ? labelFor(parentId) : ''

      await assign(created.id, parentLabel ? `${parentLabel}${PATH_SEPARATOR}${name}` : name)
    })
  }

  return (
    <div data-testid="knowledge-bit-focus-subject-panel" className="space-y-2">
      {creating ? (
        <NewSubjectForm
          testIdPrefix="knowledge-bit-focus-subject"
          options={options}
          busy={busy}
          confirmLabel="Create and assign"
          onSubmit={create}
          onBack={() => setCreating(false)}
        />
      ) : (
        <>
          <SearchableSelect
            ariaLabel="Subject"
            testId="knowledge-bit-focus-subject-select"
            options={options}
            value=""
            disabled={busy}
            onChange={pick}
            placeholder="Search subjects…"
            autoFocus
          />
          <button
            type="button"
            data-testid="knowledge-bit-focus-subject-new"
            onClick={() => setCreating(true)}
            className={SECONDARY_BUTTON_CLASS}
          >
            New subject
          </button>
        </>
      )}
      {error ? (
        <p role="alert" data-testid="knowledge-bit-focus-subject-error" className="text-xs text-red-700">
          {error}
        </p>
      ) : null}
    </div>
  )
}
