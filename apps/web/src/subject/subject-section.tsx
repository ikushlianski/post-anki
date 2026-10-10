import { useState } from 'react'
import { Link, useRouter } from '@tanstack/react-router'
import {
  DndContext,
  PointerSensor,
  useDndContext,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
} from '@dnd-kit/core'
import type { DragEndEvent } from '@dnd-kit/core'
import { SortableContext, verticalListSortingStrategy, useSortable } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { CircleAlert, GripVertical } from 'lucide-react'

import type { ModelTier } from '@post-anki/shared'
import { buildCategoryPickerOptions, wouldCreateCategoryCycle } from '@post-anki/core'
import type { Curriculum, CurriculumStatus, Subject, SubjectCategory } from '../curriculum/model'
import {
  deleteCurriculum,
  mergeCurricula,
  moveCategory,
  moveCurriculum,
  renameCategory,
  reorderCurricula,
} from '../curriculum/curriculum.api'
import { deleteSubject } from './subject.api'
import { ConfirmDelete, RenameButton } from '../curriculum/shape-controls'
import { useHydrated } from '../shared/use-hydrated'
import { reorderAfterDrag } from '../curriculum/curriculum-drag-order'
import { CreateMaterialForm } from './create-material-form'

type PendingMove =
  | { kind: 'category'; sourceId: string; sourceName: string; targetId: string }
  | {
      kind: 'curriculum'
      curriculumId: string
      curriculumName: string
      subjectId: string
      targetId: string
    }

export function resolvePendingMove(
  active: { id: string; type: unknown },
  over: { id: string; type: unknown },
  categories: SubjectCategory[],
  curricula: Curriculum[],
): PendingMove | null {
  if (active.type === 'category' && over.type === 'category' && active.id !== over.id) {
    if (wouldCreateCategoryCycle(active.id, over.id, categories)) {
      return null
    }

    const source = categories.find((category) => category.id === active.id)
    const target = categories.find((category) => category.id === over.id)

    if (!source || !target) {
      return null
    }

    return { kind: 'category', sourceId: source.id, sourceName: source.name, targetId: target.id }
  }

  if (active.type === 'curriculum' && over.type === 'category') {
    const curriculum = curricula.find((c) => c.id === active.id)

    if (!curriculum) {
      return null
    }

    return {
      kind: 'curriculum',
      curriculumId: curriculum.id,
      curriculumName: curriculum.name,
      subjectId: curriculum.subjectId,
      targetId: over.id,
    }
  }

  return null
}

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
  const [pendingMove, setPendingMove] = useState<PendingMove | null>(null)
  const [moveBusy, setMoveBusy] = useState(false)
  const [moveError, setMoveError] = useState<string | null>(null)

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: { distance: 8 },
    }),
  )

  async function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event

    if (!over) {
      return
    }

    const pending = resolvePendingMove(
      { id: String(active.id), type: active.data.current?.type },
      { id: String(over.id), type: over.data.current?.type },
      categories,
      curricula,
    )

    if (pending) {
      setMoveError(null)
      setPendingMove(pending)

      return
    }

    const activeType = active.data.current?.type
    const overType = over.data.current?.type

    if (activeType !== 'curriculum' || overType !== 'curriculum' || active.id === over.id) {
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

  async function confirmMove() {
    if (!pendingMove) {
      return
    }

    setMoveBusy(true)
    setMoveError(null)

    try {
      if (pendingMove.kind === 'category') {
        await moveCategory({
          data: { categoryId: pendingMove.sourceId, parentId: pendingMove.targetId },
        })
      } else {
        await moveCurriculum({
          data: {
            curriculumId: pendingMove.curriculumId,
            targetSubjectId: pendingMove.subjectId,
            categoryId: pendingMove.targetId,
          },
        })
      }

      setPendingMove(null)
      await router.invalidate()
    } catch (error) {
      setMoveError(error instanceof Error ? error.message : 'Move failed')
    } finally {
      setMoveBusy(false)
    }
  }

  function cancelMove() {
    setPendingMove(null)
    setMoveError(null)
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
          <DndContext sensors={sensors} onDragEnd={handleDragEnd}>
            {rootCategories.length > 0 ? (
              <ul className="mb-3 space-y-2" data-testid="subject-categories">
                {rootCategories.map((category) => (
                  <CategoryCard
                    key={category.id}
                    category={category}
                    subject={subject}
                    categories={categories}
                    curricula={curricula}
                    pendingMove={pendingMove?.targetId === category.id ? pendingMove : null}
                    moveBusy={moveBusy}
                    moveError={moveError}
                    onConfirm={confirmMove}
                    onCancel={cancelMove}
                  />
                ))}
              </ul>
            ) : null}

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
            <Link
              to="/add-knowledge"
              search={{ subjectId: subject.id }}
              data-testid="subject-add-knowledge-button"
              className="rounded-md border border-neutral-300 bg-white px-4 py-2 text-sm font-medium text-neutral-900 hover:bg-neutral-50"
            >
              Add knowledge
            </Link>
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

function CategoryCard({
  category,
  subject,
  categories,
  curricula,
  pendingMove,
  moveBusy,
  moveError,
  onConfirm,
  onCancel,
}: {
  category: SubjectCategory
  subject: Subject
  categories: SubjectCategory[]
  curricula: Curriculum[]
  pendingMove: PendingMove | null
  moveBusy: boolean
  moveError: string | null
  onConfirm: () => void
  onCancel: () => void
}) {
  const { active } = useDndContext()
  const { attributes, listeners, setNodeRef: setDragRef, isDragging } = useDraggable({
    id: category.id,
    data: { type: 'category' },
  })
  const { setNodeRef: setDropRef, isOver } = useDroppable({
    id: category.id,
    data: { type: 'category' },
  })
  const router = useRouter()
  const hydrated = useHydrated()
  const [renameBusy, setRenameBusy] = useState(false)
  const [renameError, setRenameError] = useState<string | null>(null)

  async function saveName(next: string): Promise<boolean> {
    setRenameBusy(true)
    setRenameError(null)

    try {
      await renameCategory({ data: { categoryId: category.id, name: next } })
      await router.invalidate()
      return true
    } catch {
      setRenameError('Rename failed — try again.')
      return false
    } finally {
      setRenameBusy(false)
    }
  }

  const setRefs = (node: HTMLElement | null) => {
    setDragRef(node)
    setDropRef(node)
  }

  const cycleBlocked =
    active?.data.current?.type === 'category' &&
    wouldCreateCategoryCycle(String(active.id), category.id, categories)

  const itemCount =
    curricula.filter((c) => c.categoryId === category.id).length +
    categories.filter((c) => c.parentId === category.id).length

  return (
    <li
      ref={setRefs}
      data-testid={`category-card-${category.id}`}
      className={`${isOver ? 'ring-2 ring-indigo-400' : ''} ${
        isDragging || cycleBlocked ? 'opacity-40' : ''
      }`}
    >
      <div className="flex items-center gap-2">
        <button
          type="button"
          className="shrink-0 text-neutral-400 hover:text-neutral-600 cursor-grab active:cursor-grabbing"
          {...attributes}
          {...listeners}
          data-testid={`category-drag-handle-${category.id}`}
          aria-label="Drag to nest"
        >
          <GripVertical size={16} />
        </button>
        <Link
          to="/subject/$subjectId/category/$categoryId"
          params={{ subjectId: subject.id, categoryId: category.id }}
          data-testid={`category-link-${category.id}`}
          className="flex flex-1 items-center justify-between card-compact hover:border-neutral-400"
        >
          <span className="text-sm font-medium">📁 {category.name}</span>
          <span className="text-sm text-neutral-400">{formatItemCount(itemCount)}</span>
        </Link>
        <RenameButton
          value={category.name}
          busy={renameBusy}
          hydrated={hydrated}
          onSave={saveName}
          error={renameError}
          testId={`category-rename-${category.id}`}
        />
      </div>
      {pendingMove ? (
        <span
          data-testid={`category-move-confirm-bar-${category.id}`}
          className="mt-2 flex items-center gap-2 text-xs"
        >
          <span className="text-neutral-600">
            {pendingMove.kind === 'category'
              ? `Nest under ${category.name}?`
              : `File under ${category.name}?`}
          </span>
          <button
            type="button"
            disabled={moveBusy}
            data-testid={`category-move-confirm-${category.id}`}
            onClick={onConfirm}
            className="font-medium text-indigo-600 hover:text-indigo-700 disabled:opacity-40"
          >
            confirm
          </button>
          <button
            type="button"
            data-testid={`category-move-cancel-${category.id}`}
            onClick={onCancel}
            className="text-neutral-400 hover:text-neutral-700"
          >
            cancel
          </button>
          {moveError ? (
            <span data-testid={`category-move-error-${category.id}`} className="text-red-600">
              {moveError}
            </span>
          ) : null}
        </span>
      ) : null}
    </li>
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
    data: { type: 'curriculum' },
  })

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  }

  return (
    <li
      ref={setNodeRef}
      style={style}
      className="flex items-center gap-2"
      data-testid={`curriculum-item-${curriculum.id}`}
    >
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

const NEEDS_DECISION: ReadonlySet<CurriculumStatus> = new Set([
  'awaiting_source_approval',
  'failed',
  'ready',
])

function StatusBadge({ status }: { status: CurriculumStatus }) {
  const badge = STATUS_BADGE[status]

  return (
    <span
      className={`shrink-0 whitespace-nowrap badge ${badge.className}`}
    >
      {NEEDS_DECISION.has(status) ? (
        <CircleAlert
          size={14}
          aria-hidden="true"
          data-testid="needs-decision-icon"
          className="mr-1 inline align-[-2px]"
        />
      ) : null}
      {badge.label}
    </span>
  )
}
