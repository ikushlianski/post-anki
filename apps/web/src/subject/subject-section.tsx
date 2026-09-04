import { useState } from 'react'
import { Link, useRouter } from '@tanstack/react-router'
import {
  DndContext,
  PointerSensor,
  useSensor,
  useSensors,
} from '@dnd-kit/core'
import type { DragEndEvent } from '@dnd-kit/core'
import { SortableContext, verticalListSortingStrategy, useSortable } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { GripVertical } from 'lucide-react'

import type { ModelTier } from '@post-anki/shared'
import { buildCategoryPickerOptions } from '@post-anki/core'
import type { Curriculum, CurriculumStatus, Subject, SubjectCategory } from '../curriculum/model'
import {
  deleteCurriculum,
  mergeCurricula,
  moveCurriculum,
  reorderCurricula,
} from '../curriculum/curriculum.api'
import { deleteSubject } from './subject.api'
import { ConfirmDelete } from '../curriculum/shape-controls'
import { useHydrated } from '../shared/use-hydrated'
import { reorderAfterDrag } from '../curriculum/curriculum-drag-order'
import { CreateMaterialForm } from './create-material-form'

// Mirrors the dashboard's subject-count treatment
// (apps/web/src/routes/index.tsx) — "No curricula yet" for zero, otherwise
// a singular-aware "N item(s)" count — rather than a bare "{n} item(s)"
// with no zero-state phrasing.
function formatItemCount(count: number): string {
  if (count === 0) {
    return 'No curricula yet'
  }

  return `${count} item${count === 1 ? '' : 's'}`
}

export function SubjectSection({
  subject,
  curricula,
  allSubjects,
  categories = [],
  allCategories = [],
}: {
  subject: Subject
  curricula: Curriculum[]
  allSubjects: Subject[]
  categories?: SubjectCategory[]
  allCategories?: SubjectCategory[]
  globalModelTier?: ModelTier
}) {
  const router = useRouter()
  const uncategorized = curricula.filter((c) => c.categoryId === null)
  const rootCategories = categories.filter((category) => category.parentId === null)
  const [localOrder, setLocalOrder] = useState<string[]>(uncategorized.map((c) => c.id))
  const [reorderError, setReorderError] = useState<string | null>(null)

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: { distance: 8 },
    }),
  )

  async function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event

    if (!over || active.id === over.id) {
      return
    }

    const currentOrder = localOrder
    const newOrder = reorderAfterDrag(currentOrder, String(active.id), String(over.id))

    setLocalOrder(newOrder)
    setReorderError(null)

    try {
      await reorderCurricula({
        data: { subjectId: subject.id, orderedIds: newOrder },
      })
      await router.invalidate()
    } catch (error) {
      setReorderError(
        error instanceof Error ? error.message : 'Failed to reorder curricula',
      )
      setLocalOrder(currentOrder)
    }
  }

  return (
    <section data-testid="subject-card" data-subject-id={subject.id}>
      {subject.kind === 'language-practice' ? (
        <Link
          to="/practice/$subjectId"
          params={{ subjectId: subject.id }}
          data-testid="open-practice-link"
          className="flex items-center justify-between card-compact font-medium hover:border-neutral-400"
        >
          Open practice
        </Link>
      ) : (
        <>
          {rootCategories.length > 0 ? (
            <ul className="mb-3 space-y-2" data-testid="subject-categories">
              {rootCategories.map((category) => (
                <li key={category.id}>
                  <Link
                    to="/subject/$subjectId/category/$categoryId"
                    params={{ subjectId: subject.id, categoryId: category.id }}
                    data-testid={`category-link-${category.id}`}
                    className="flex items-center justify-between card-compact hover:border-neutral-400"
                  >
                    <span className="text-sm font-medium">📁 {category.name}</span>
                    <span className="text-sm text-neutral-400">
                      {formatItemCount(
                        curricula.filter((c) => c.categoryId === category.id).length +
                          categories.filter((c) => c.parentId === category.id).length,
                      )}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          ) : null}

          <DndContext sensors={sensors} onDragEnd={handleDragEnd}>
            <ul className="mb-3 space-y-2">
              {uncategorized.length === 0 && rootCategories.length === 0 ? (
                <li className="text-sm text-neutral-400">No curricula yet.</li>
              ) : (
                <SortableContext items={localOrder} strategy={verticalListSortingStrategy}>
                  {uncategorized.map((curriculum) => (
                    <SortableCurriculumItem
                      key={curriculum.id}
                      curriculum={curriculum}
                      allCurricula={uncategorized}
                      allSubjects={allSubjects}
                      allCategories={allCategories}
                    />
                  ))}
                </SortableContext>
              )}
            </ul>
          </DndContext>
          {reorderError ? (
            <div data-testid="reorder-error" className="mb-3 alert alert-error">
              {reorderError}
            </div>
          ) : null}

          <div className="flex flex-wrap items-center gap-3">
            <CreateMaterialForm
              subjectId={subject.id}
              subjectName={subject.name}
              requireSources={subject.requireSources}
              categories={categories}
              defaultSelectedNodeId={null}
            />
          </div>
        </>
      )}
    </section>
  )
}

export function DeleteSubjectButton({ subjectId }: { subjectId: string }) {
  const router = useRouter()
  const [busy, setBusy] = useState(false)
  const hydrated = useHydrated()

  async function confirm() {
    setBusy(true)
    await deleteSubject({ data: subjectId })
    setBusy(false)
    await router.navigate({ to: '/' })
  }

  return (
    <ConfirmDelete
      busy={busy}
      hydrated={hydrated}
      label="Delete subject"
      onConfirm={confirm}
      testId="delete-subject"
    />
  )
}

function OriginBadge() {
  return (
    <span className="badge-indigo">
      🔎 Researched
    </span>
  )
}

function SortableCurriculumItem({
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
  const { attributes, listeners, setNodeRef, transform, transition } = useSortable({
    id: curriculum.id,
  })

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  }

  return (
    <li ref={setNodeRef} style={style} className="flex items-center gap-2">
      <button
        type="button"
        className="shrink-0 text-neutral-400 hover:text-neutral-600 cursor-grab active:cursor-grabbing"
        {...attributes}
        {...listeners}
        data-testid={`drag-handle-${curriculum.id}`}
        aria-label="Drag to reorder"
      >
        <GripVertical size={16} />
      </button>
      <Link
        to="/curriculum/$curriculumId"
        params={{ curriculumId: curriculum.id }}
        className="flex flex-1 items-center justify-between card-compact hover:border-neutral-400"
      >
        <span
          data-testid="curriculum-name"
          className="min-w-0 flex-1 truncate text-sm font-medium"
        >
          {curriculum.name}
        </span>
        <span className="flex shrink-0 items-center gap-2">
          {curriculum.origin === 'research' ? <OriginBadge /> : null}
          <StatusBadge status={curriculum.status} />
        </span>
      </Link>
      <CurriculumRowActions
        curriculum={curriculum}
        allCurricula={allCurricula}
        allSubjects={allSubjects}
        allCategories={allCategories}
      />
    </li>
  )
}

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
  const router = useRouter()
  const [busy, setBusy] = useState(false)
  const hydrated = useHydrated()

  async function confirm() {
    setBusy(true)
    await deleteCurriculum({ data: curriculumId })
    setBusy(false)
    await router.invalidate()
  }

  return <ConfirmDelete busy={busy} hydrated={hydrated} label="Delete curriculum" onConfirm={confirm} />
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
      <select
        data-testid={`curriculum-merge-target-select-${curriculum.id}`}
        value={targetCurriculumId}
        onChange={(event) => setTargetCurriculumId(event.target.value)}
        className="rounded-md border border-neutral-200 px-1.5 py-0.5 text-xs"
      >
        <option value="">select target…</option>
        {options.map((option) => (
          <option key={option.id} value={option.id} disabled={option.status === 'failed'}>
            {option.name}
            {option.status === 'failed' ? ' (failed — cannot merge into this)' : ''}
          </option>
        ))}
      </select>
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
        <span data-testid={`curriculum-merge-error-${curriculum.id}`} className="text-red-600">
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
      <select
        data-testid={`curriculum-move-target-select-${curriculum.id}`}
        value={targetSubjectId}
        onChange={(event) => {
          setTargetSubjectId(event.target.value)
          setTargetCategoryId(null)
        }}
        className="rounded-md border border-neutral-200 px-1.5 py-0.5 text-xs"
      >
        <option value="">select subject…</option>
        {options.map((option) => (
          <option key={option.id} value={option.id}>
            {option.name}
          </option>
        ))}
      </select>
      {targetSubjectId ? (
        <select
          data-testid={`curriculum-move-category-select-${curriculum.id}`}
          value={targetCategoryId ?? ''}
          onChange={(event) =>
            setTargetCategoryId(event.target.value === '' ? null : event.target.value)
          }
          className="rounded-md border border-neutral-200 px-1.5 py-0.5 text-xs"
        >
          {categoryOptions.map((option) => (
            <option key={option.nodeId ?? '__root__'} value={option.nodeId ?? ''}>
              {option.label}
            </option>
          ))}
        </select>
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
        <span data-testid={`curriculum-move-error-${curriculum.id}`} className="text-red-600">
          {error}
        </span>
      ) : null}
    </span>
  )
}


const STATUS_BADGE: Record<CurriculumStatus, { label: string; className: string }> =
  {
    draft: { label: 'draft', className: 'bg-neutral-100 text-neutral-500' },
    curating: { label: 'parsing…', className: 'bg-blue-100 text-blue-700' },
    awaiting_source_approval: {
      label: 'awaiting source approval',
      className: 'bg-violet-100 text-violet-700',
    },
    shaping_structure: {
      label: 'shaping structure',
      className: 'bg-indigo-100 text-indigo-700',
    },
    ready: { label: 'ready to confirm', className: 'bg-amber-100 text-amber-700' },
    confirmed: { label: 'confirmed', className: 'bg-emerald-100 text-emerald-700' },
    failed: { label: 'parse failed', className: 'bg-red-100 text-red-700' },
  }

function StatusBadge({ status }: { status: CurriculumStatus }) {
  const badge = STATUS_BADGE[status]

  return (
    <span
      className={`shrink-0 whitespace-nowrap badge ${badge.className}`}
    >
      {badge.label}
    </span>
  )
}
