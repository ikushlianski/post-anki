import { useState } from 'react'

import type { ComplexityLevel } from '@post-anki/shared'

import type { Subject } from '../curriculum/model'
import { NewSubjectForm } from '../subject/new-subject-form'
import { createSubject } from '../subject/subject.api'
import type { SearchableOption } from '../ui/searchable-select'

interface AddKnowledgeNewSubjectProps {
  options: readonly SearchableOption[]
  disabled: boolean
  onCreated: (subject: Subject) => void
}

export function AddKnowledgeNewSubject({ options, disabled, onCreated }: AddKnowledgeNewSubjectProps) {
  const [open, setOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function create({ name, parentId, complexityLevel }: { name: string; parentId: string | null; complexityLevel?: ComplexityLevel }) {
    setBusy(true)
    setError(null)

    try {
      const created = await createSubject({ data: { name, kind: 'architecture-mentor', parentId, complexityLevel } })

      onCreated(created)
      setOpen(false)
    } catch {
      setError("Couldn't create the subject — try again.")
    } finally {
      setBusy(false)
    }
  }

  if (!open) {
    return (
      <button
        type="button"
        disabled={disabled}
        onClick={() => setOpen(true)}
        data-testid="knowledge-new-subject-button"
        className="text-sm text-neutral-600 hover:text-neutral-900 disabled:opacity-50"
      >
        + New subject
      </button>
    )
  }

  return (
    <div data-testid="knowledge-new-subject-panel" className="space-y-2">
      <NewSubjectForm
        testIdPrefix="knowledge-new-subject"
        options={options}
        busy={busy}
        confirmLabel="Create and select"
        onSubmit={(input) => void create(input)}
        onBack={() => setOpen(false)}
      />

      {error && (
        <p role="alert" data-testid="knowledge-new-subject-error" className="text-sm text-red-700">
          {error}
        </p>
      )}
    </div>
  )
}
