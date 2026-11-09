import { useState } from 'react'

import { createSubject } from '../subject/subject.api'
import { SearchableSelect } from '../ui/searchable-select'
import { SECONDARY_BUTTON_CLASS, TEXT_FIELD_CLASS } from './knowledge-bit-review-classes'
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
  const [name, setName] = useState('')
  const [parentId, setParentId] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const trimmed = name.trim()

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

  function create() {
    void run(async () => {
      const created = await createSubject({
        data: { name: trimmed, kind: 'architecture-mentor', parentId: parentId || null },
      })
      const parentLabel = parentId ? labelFor(parentId) : ''

      await assign(created.id, parentLabel ? `${parentLabel}${PATH_SEPARATOR}${trimmed}` : trimmed)
    })
  }

  return (
    <div data-testid="knowledge-bit-focus-subject-panel" className="space-y-2">
      {creating ? (
        <>
          <input
            aria-label="New subject name"
            data-testid="knowledge-bit-focus-subject-new-name"
            value={name}
            maxLength={60}
            disabled={busy}
            onChange={(event) => setName(event.target.value)}
            className={TEXT_FIELD_CLASS}
          />
          <SearchableSelect
            ariaLabel="Parent subject"
            testId="knowledge-bit-focus-subject-parent"
            options={options}
            value={parentId}
            onChange={setParentId}
            placeholder="Top level (no parent)"
            clearable
          />
          <div className="flex gap-2">
            <button
              type="button"
              data-testid="knowledge-bit-focus-subject-create"
              disabled={busy || trimmed.length === 0}
              onClick={create}
              className={SECONDARY_BUTTON_CLASS}
            >
              {busy ? 'Saving…' : 'Create and assign'}
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={() => setCreating(false)}
              className={SECONDARY_BUTTON_CLASS}
            >
              Back
            </button>
          </div>
        </>
      ) : (
        <>
          <SearchableSelect
            ariaLabel="Subject"
            testId="knowledge-bit-focus-subject-select"
            options={options}
            value=""
            disabled={busy}
            onChange={pick}
            placeholder="Choose a subject…"
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
