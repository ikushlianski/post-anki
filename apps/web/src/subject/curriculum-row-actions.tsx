import { useState } from 'react'
import { useRouter } from '@tanstack/react-router'

import { buildCategoryPickerOptions } from '@post-anki/core'
import type { Curriculum, Subject, SubjectCategory } from '../curriculum/model'
import { deleteCurriculum, mergeCurricula, moveCurriculum } from '../curriculum/curriculum.api'
import { ConfirmDelete } from '../curriculum/shape-controls'
import { ActionFailedLine } from '../curriculum/action-failed-line'
import { useGuardedRun } from '../curriculum/use-guarded-run'
import { useHydrated } from '../shared/use-hydrated'
import { SearchableSelect } from '../ui/searchable-select'

// subject-category-nesting SCENARIO 9 — shared with the category detail
// page (subject.$subjectId.category.$categoryId.tsx) so a curriculum
// rendered inside a category also has a move/merge/delete path, not just
// curricula rendered directly on the subject page.
export function CurriculumRowActions({
  curriculum,
  allCurricula,
  allSubjects,
  allCategories,
}: {
  curriculum: Curriculum
  allCurricula: Curriculum[]
  allSubjects: Subject[]
  allCategories: SubjectCategory[]
}) {
  return (
    <span className="flex shrink-0 items-center gap-2">
      <MergeCurriculumButton curriculum={curriculum} curricula={allCurricula} />
      <MoveCurriculumButton
        curriculum={curriculum}
        allSubjects={allSubjects}
        allCategories={allCategories}
      />
      <DeleteCurriculumButton curriculumId={curriculum.id} />
    </span>
  )
}

function DeleteCurriculumButton({ curriculumId }: { curriculumId: string }) {
  const { busy, failed, run } = useGuardedRun()
  const hydrated = useHydrated()

  return (
    <>
      <ConfirmDelete
        busy={busy}
        hydrated={hydrated}
        label="Delete curriculum"
        consequence="Deletes its sources and topics"
        onConfirm={() => run(() => deleteCurriculum({ data: curriculumId }))}
      />
      <ActionFailedLine failed={failed} testId={`curriculum-delete-failed-${curriculumId}`} />
    </>
  )
}

function MergeCurriculumButton({
  curriculum,
  curricula,
}: {
  curriculum: Curriculum
  curricula: Curriculum[]
}) {
  const router = useRouter()
  const [armed, setArmed] = useState(false)
  const [busy, setBusy] = useState(false)
  const [targetCurriculumId, setTargetCurriculumId] = useState('')
  const [error, setError] = useState<string | null>(null)

  const options = curricula.filter((candidate) => candidate.id !== curriculum.id)

  async function confirm() {
    if (!targetCurriculumId) {
      return
    }

    setBusy(true)
    setError(null)

    try {
      await mergeCurricula({
        data: { targetCurriculumId, sourceCurriculumId: curriculum.id },
      })
      await router.invalidate()
    } catch {
      // The backend is the real gate here (a failed target's "Retry"/
      // "Reparse" action would otherwise delete this merge's own content
      // later, with no timing coincidence required — see
      // docs/architecture/curriculum-merge/review.md). Disabling failed
      // options below covers the common case; this generic message covers
      // a target that failed in the moment between opening the picker and
      // confirming, without depending on the server-fn error shape.
      setError("Couldn't merge — the target may no longer be valid. Choose a different target.")
    } finally {
      setBusy(false)
    }
  }

  if (!armed) {
    return (
      <button
        type="button"
        data-testid={`curriculum-merge-button-${curriculum.id}`}
        onClick={() => setArmed(true)}
        className="shrink-0 text-xs text-neutral-400 hover:text-indigo-600"
      >
        Merge into…
      </button>
    )
  }

  return (
    <span className="flex shrink-0 items-center gap-2 text-xs">
      <SearchableSelect
        ariaLabel="Merge into curriculum"
        testId={`curriculum-merge-target-select-${curriculum.id}`}
        options={options.map((option) => ({
          id: option.id,
          label: option.name,
          disabledReason: option.status === 'failed' ? 'Failed — cannot merge into this' : undefined,
        }))}
        value={targetCurriculumId}
        onChange={setTargetCurriculumId}
        placeholder="select target…"
        className="w-full min-w-48 cursor-pointer rounded-md border border-neutral-200 bg-white py-0.5 pl-1.5 pr-7 text-xs"
      />
      <button
        type="button"
        disabled={busy || !targetCurriculumId}
        data-testid={`curriculum-merge-confirm-${curriculum.id}`}
        onClick={confirm}
        className="font-medium text-indigo-600 hover:text-indigo-700 disabled:opacity-40"
      >
        Confirm
      </button>
      <button
        type="button"
        data-testid={`curriculum-merge-cancel-${curriculum.id}`}
        onClick={() => setArmed(false)}
        className="text-neutral-400 hover:text-neutral-700"
      >
        cancel
      </button>
      {error ? (
        <span role="alert" data-testid={`curriculum-merge-error-${curriculum.id}`} className="text-red-600">
          {error}
        </span>
      ) : null}
    </span>
  )
}

function MoveCurriculumButton({
  curriculum,
  allSubjects,
  allCategories,
}: {
  curriculum: Curriculum
  allSubjects: Subject[]
  allCategories: SubjectCategory[]
}) {
  const router = useRouter()
  const [armed, setArmed] = useState(false)
  const [busy, setBusy] = useState(false)
  const [targetSubjectId, setTargetSubjectId] = useState('')
  const [targetCategoryId, setTargetCategoryId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  // subject-category-nesting SCENARIO 9 — the curriculum's own subject stays
  // in the list (unlike the older subject-to-subject move this control used
  // to be) so a curriculum can be reassigned to a different category, or
  // pulled back to no category, without a subject change. The backend
  // relaxes its own same_subject rejection exactly when a category is
  // specified (see curriculum.repo.ts moveCurriculumToSubject).
  const options = allSubjects.filter((candidate) => candidate.kind === 'architecture-mentor')
  const targetSubject = options.find((option) => option.id === targetSubjectId)
  const categoryOptions = targetSubject
    ? buildCategoryPickerOptions(allCategories, targetSubject.id, targetSubject.name)
    : []

  async function confirm() {
    if (!targetSubjectId) {
      return
    }

    setBusy(true)
    setError(null)

    try {
      // subject-category-nesting SCENARIO 8 — subject + category move as one
      // atomic action; targetCategoryId defaults to the target subject's
      // root (null) unless a category was explicitly chosen.
      await moveCurriculum({
        data: { curriculumId: curriculum.id, targetSubjectId, categoryId: targetCategoryId },
      })
      await router.invalidate()
    } catch {
      setError("Couldn't move — pick a different subject and try again.")
    } finally {
      setBusy(false)
    }
  }

  if (!armed) {
    return (
      <button
        type="button"
        data-testid={`curriculum-move-button-${curriculum.id}`}
        onClick={() => setArmed(true)}
        className="shrink-0 text-xs text-neutral-400 hover:text-indigo-600"
      >
        Move to…
      </button>
    )
  }

  return (
    <span className="flex shrink-0 items-center gap-2 text-xs">
      <SearchableSelect
        clearable
        ariaLabel="Move to subject"
        options={options.map((option) => ({ id: option.id, label: option.name }))}
        value={targetSubjectId}
        onChange={(id) => {
          setTargetSubjectId(id)
          setTargetCategoryId(null)
        }}
        testId={`curriculum-move-target-select-${curriculum.id}`}
        placeholder="Search subjects…"
        autoFocus
        className="w-full min-w-48 cursor-pointer rounded-md border border-neutral-200 bg-white py-0.5 pl-1.5 pr-7 text-xs"
      />
      {targetSubjectId ? (
        <SearchableSelect
          ariaLabel="Move to category"
          testId={`curriculum-move-category-select-${curriculum.id}`}
          options={categoryOptions.map((option) => ({ id: option.nodeId ?? '__root__', label: option.label }))}
          value={targetCategoryId ?? '__root__'}
          onChange={(id) => setTargetCategoryId(id === '' || id === '__root__' ? null : id)}
          className="w-full min-w-48 cursor-pointer rounded-md border border-neutral-200 bg-white py-0.5 pl-1.5 pr-7 text-xs"
        />
      ) : null}
      <button
        type="button"
        disabled={busy || !targetSubjectId}
        data-testid={`curriculum-move-confirm-${curriculum.id}`}
        onClick={confirm}
        className="font-medium text-indigo-600 hover:text-indigo-700 disabled:opacity-40"
      >
        Confirm
      </button>
      <button
        type="button"
        data-testid={`curriculum-move-cancel-${curriculum.id}`}
        onClick={() => setArmed(false)}
        className="text-neutral-400 hover:text-neutral-700"
      >
        cancel
      </button>
      {error ? (
        <span role="alert" data-testid={`curriculum-move-error-${curriculum.id}`} className="text-red-600">
          {error}
        </span>
      ) : null}
    </span>
  )
}
