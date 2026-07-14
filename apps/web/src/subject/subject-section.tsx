import { useState } from 'react'
import { Link, useRouter } from '@tanstack/react-router'

import type { Curriculum, CurriculumStatus, Subject } from '../curriculum/model'
import { CreateCurriculumForm } from '../curriculum/create-curriculum-form'
import { deleteCurriculum } from '../curriculum/curriculum.api'
import { ConfirmDelete } from '../curriculum/shape-controls'
import { deleteSubject } from './subject.api'

export function SubjectSection({
  subject,
  curricula,
}: {
  subject: Subject
  curricula: Curriculum[]
}) {
  return (
    <section data-testid="subject-card">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-x-4 gap-y-1">
        <h2
          data-testid="subject-name"
          className="min-w-0 truncate text-lg font-medium tracking-tight"
        >
          {subject.name}
        </h2>
        <DeleteSubjectButton
          subjectId={subject.id}
          curriculaCount={curricula.length}
        />
      </div>

      <ul className="mb-3 space-y-2">
        {curricula.length === 0 ? (
          <li className="text-sm text-neutral-400">No curricula yet.</li>
        ) : (
          curricula.map((curriculum) => (
            <li key={curriculum.id} className="flex items-center gap-2">
              <Link
                to="/curriculum/$curriculumId"
                params={{ curriculumId: curriculum.id }}
                className="flex flex-1 items-center justify-between rounded-lg border border-neutral-200 bg-white px-4 py-3 hover:border-neutral-400"
              >
                <span className="min-w-0 flex-1 truncate text-sm font-medium">
                  {curriculum.name}
                </span>
                <StatusBadge status={curriculum.status} />
              </Link>
              <DeleteCurriculumButton curriculumId={curriculum.id} />
            </li>
          ))
        )}
      </ul>

      <CreateCurriculumForm
        subjectId={subject.id}
        requireSources={subject.requireSources}
      />
    </section>
  )
}

function DeleteCurriculumButton({ curriculumId }: { curriculumId: string }) {
  const router = useRouter()
  const [busy, setBusy] = useState(false)

  async function confirm() {
    setBusy(true)
    await deleteCurriculum({ data: curriculumId })
    setBusy(false)
    await router.invalidate()
  }

  return <ConfirmDelete busy={busy} label="Delete curriculum" onConfirm={confirm} />
}

function DeleteSubjectButton({
  subjectId,
  curriculaCount,
}: {
  subjectId: string
  curriculaCount: number
}) {
  const router = useRouter()
  const [armed, setArmed] = useState(false)
  const [busy, setBusy] = useState(false)

  async function confirm() {
    setBusy(true)
    await deleteSubject({ data: subjectId })
    setBusy(false)
    await router.invalidate()
  }

  if (!armed) {
    return (
      <button
        type="button"
        onClick={() => setArmed(true)}
        className="shrink-0 text-xs text-neutral-400 hover:text-red-600"
      >
        Delete subject
      </button>
    )
  }

  return (
    <span className="flex shrink-0 items-center gap-2 text-xs">
      <span className="text-neutral-500">
        {curriculaCount > 0
          ? `Also deletes ${curriculaCount} curricul${curriculaCount === 1 ? 'um' : 'a'}.`
          : 'Delete this subject?'}
      </span>
      <button
        type="button"
        disabled={busy}
        onClick={confirm}
        className="font-medium text-red-600 hover:text-red-700 disabled:opacity-40"
      >
        Confirm
      </button>
      <button
        type="button"
        onClick={() => setArmed(false)}
        className="text-neutral-400 hover:text-neutral-700"
      >
        cancel
      </button>
    </span>
  )
}

const STATUS_BADGE: Record<CurriculumStatus, { label: string; className: string }> =
  {
    draft: { label: 'draft', className: 'bg-neutral-100 text-neutral-500' },
    curating: { label: 'parsing…', className: 'bg-blue-100 text-blue-700' },
    ready: { label: 'ready to confirm', className: 'bg-amber-100 text-amber-700' },
    confirmed: { label: 'confirmed', className: 'bg-emerald-100 text-emerald-700' },
    failed: { label: 'parse failed', className: 'bg-red-100 text-red-700' },
  }

function StatusBadge({ status }: { status: CurriculumStatus }) {
  const badge = STATUS_BADGE[status]

  return (
    <span
      className={`shrink-0 whitespace-nowrap rounded-full px-2 py-0.5 text-xs ${badge.className}`}
    >
      {badge.label}
    </span>
  )
}
