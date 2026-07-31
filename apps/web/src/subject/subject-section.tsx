import { useEffect, useState } from 'react'
import { Link, useRouter } from '@tanstack/react-router'
import {
  DndContext,
  KeyboardSensor,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
} from '@dnd-kit/core'
import type { DragEndEvent } from '@dnd-kit/core'
import {
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { GripVertical } from 'lucide-react'

import type { Curriculum, CurriculumStatus, Subject } from '../curriculum/model'
import { CreateCurriculumForm } from '../curriculum/create-curriculum-form'
import { StudyTechnologyForm } from '../curriculum/study-technology-form'
import {
  deleteCurriculum,
  mergeCurricula,
  reorderCurricula,
} from '../curriculum/curriculum.api'
import { reorderAfterDrag } from '../curriculum/curriculum-drag-order'
import { ConfirmDelete } from '../curriculum/shape-controls'
import { deleteSubject, mergeSubjects } from './subject.api'

export function SubjectSection({
  subject,
  curricula,
  allSubjects,
}: {
  subject: Subject
  curricula: Curriculum[]
  allSubjects: Subject[]
}) {
  return (
    <section data-testid="subject-card" data-subject-id={subject.id}>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-x-4 gap-y-1">
        <h2
          data-testid="subject-name"
          className="min-w-0 truncate text-lg font-medium tracking-tight"
        >
          {subject.name}
        </h2>
        <span className="flex shrink-0 items-center gap-3">
          {subject.kind === 'architecture-mentor' ? (
            <MergeSubjectButton subject={subject} allSubjects={allSubjects} />
          ) : null}
          <DeleteSubjectButton
            subjectId={subject.id}
            curriculaCount={curricula.length}
          />
        </span>
      </div>

      {subject.kind === 'language-practice' ? (
        <Link
          to="/practice/$subjectId"
          params={{ subjectId: subject.id }}
          data-testid="open-practice-link"
          className="flex items-center justify-between rounded-lg border border-neutral-200 bg-white px-4 py-3 text-sm font-medium hover:border-neutral-400"
        >
          Open practice
        </Link>
      ) : (
        <>
          <CourseList subjectId={subject.id} curricula={curricula} />

          <div className="flex flex-wrap items-center gap-3">
            <CreateCurriculumForm
              subjectId={subject.id}
              requireSources={subject.requireSources}
            />
            <StudyTechnologyForm subjectId={subject.id} />
          </div>
        </>
      )}
    </section>
  )
}

// course-priority-drag-reorder (issue #69) — owns the drag-and-drop
// reordering of a subject's courses (Scenarios 1, 3, 5b, 7). Local `orderIds`
// state, seeded from props and updated synchronously in `onDragEnd` via the
// pure `reorderAfterDrag`, is what drives `SortableContext`'s `items` and the
// rendered list order — dnd-kit's own drop animation would otherwise snap
// the dragged item back to its pre-drag slot the instant it's released,
// since `items` still says that's where it belongs, until
// `router.invalidate()` resolves. On a rejected mutation (Scenario 5b — a
// stale drag racing another tab's create/delete), local order reverts to
// the pre-drag state and a visible error appears, following
// `MergeCurriculumButton`'s working try/catch + error-span pattern rather
// than `DeleteCurriculumButton`'s, which swallows a thrown rejection.
function CourseList({
  subjectId,
  curricula,
}: {
  subjectId: string
  curricula: Curriculum[]
}) {
  const router = useRouter()
  const [orderIds, setOrderIds] = useState(() => curricula.map((c) => c.id))
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    setOrderIds(curricula.map((c) => c.id))
  }, [curricula])

  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  )

  if (curricula.length === 0) {
    return <p className="mb-3 text-sm text-neutral-400">No curricula yet.</p>
  }

  const byId = new Map(curricula.map((c) => [c.id, c]))
  const orderedCurricula = orderIds
    .map((id) => byId.get(id))
    .filter((c): c is Curriculum => c !== undefined)

  async function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event

    if (!over) {
      return
    }

    const activeId = String(active.id)
    const overId = String(over.id)

    if (activeId === overId) {
      return
    }

    const previousOrderIds = orderIds
    const nextOrderIds = reorderAfterDrag(orderIds, activeId, overId)

    setOrderIds(nextOrderIds)
    setError(null)

    try {
      await reorderCurricula({ data: { subjectId, orderedIds: nextOrderIds } })
      await router.invalidate()
    } catch {
      // Scenario 5b — the drag-list this tab rendered from is stale (another
      // tab created/deleted a course mid-drag), so the backend's exact-id-set
      // check rejected the request. Revert to the pre-drag order and
      // re-invalidate so the learner's next drag starts from the current,
      // correct list, rather than leaving them looking at an order that was
      // never actually persisted.
      setOrderIds(previousOrderIds)
      setError("Couldn't reorder — the list may have changed. Try dragging again.")
      await router.invalidate()
    }
  }

  return (
    <>
      <DndContext
        sensors={sensors}
        collisionDetection={closestCenter}
        onDragEnd={(event) => {
          void handleDragEnd(event)
        }}
      >
        <SortableContext items={orderIds} strategy={verticalListSortingStrategy}>
          <ul className="mb-3 space-y-2">
            {orderedCurricula.map((curriculum) => (
              <SortableCurriculumRow
                key={curriculum.id}
                curriculum={curriculum}
                curricula={curricula}
              />
            ))}
          </ul>
        </SortableContext>
      </DndContext>
      {error ? (
        <p data-testid="reorder-error" className="mb-3 text-xs text-red-600">
          {error}
        </p>
      ) : null}
    </>
  )
}

function SortableCurriculumRow({
  curriculum,
  curricula,
}: {
  curriculum: Curriculum
  curricula: Curriculum[]
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id: curriculum.id })

  const style = {
    transform: CSS.Transform.toString(transform),
    transition: transition ?? undefined,
    opacity: isDragging ? 0.5 : 1,
  }

  return (
    <li ref={setNodeRef} style={style} className="flex items-center gap-2">
      <button
        type="button"
        data-testid={`curriculum-drag-handle-${curriculum.id}`}
        aria-label={`Reorder ${curriculum.name}`}
        className="shrink-0 cursor-grab touch-none text-neutral-300 hover:text-neutral-500"
        {...attributes}
        {...listeners}
      >
        <GripVertical size={16} />
      </button>
      <Link
        to="/curriculum/$curriculumId"
        params={{ curriculumId: curriculum.id }}
        className="flex flex-1 items-center justify-between rounded-lg border border-neutral-200 bg-white px-4 py-3 hover:border-neutral-400"
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
      <MergeCurriculumButton curriculum={curriculum} curricula={curricula} />
      <DeleteCurriculumButton curriculumId={curriculum.id} />
    </li>
  )
}

function OriginBadge() {
  return (
    <span className="rounded-full bg-violet-100 px-2 py-0.5 text-xs text-violet-700">
      🔎 Researched
    </span>
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

function MergeSubjectButton({
  subject,
  allSubjects,
}: {
  subject: Subject
  allSubjects: Subject[]
}) {
  const router = useRouter()
  const [armed, setArmed] = useState(false)
  const [busy, setBusy] = useState(false)
  const [targetSubjectId, setTargetSubjectId] = useState('')

  const options = allSubjects.filter(
    (candidate) => candidate.id !== subject.id && candidate.kind === 'architecture-mentor',
  )

  async function confirm() {
    if (!targetSubjectId) {
      return
    }

    setBusy(true)
    await mergeSubjects({ data: { targetSubjectId, sourceSubjectId: subject.id } })
    setBusy(false)
    await router.invalidate()
  }

  if (!armed) {
    return (
      <button
        type="button"
        data-testid={`subject-merge-button-${subject.id}`}
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
        data-testid={`subject-merge-target-select-${subject.id}`}
        value={targetSubjectId}
        onChange={(event) => setTargetSubjectId(event.target.value)}
        className="rounded-md border border-neutral-200 px-1.5 py-0.5 text-xs"
      >
        <option value="">select target…</option>
        {options.map((option) => (
          <option key={option.id} value={option.id}>
            {option.name}
          </option>
        ))}
      </select>
      <button
        type="button"
        disabled={busy || !targetSubjectId}
        data-testid={`subject-merge-confirm-${subject.id}`}
        onClick={confirm}
        className="font-medium text-indigo-600 hover:text-indigo-700 disabled:opacity-40"
      >
        Confirm
      </button>
      <button
        type="button"
        data-testid={`subject-merge-cancel-${subject.id}`}
        onClick={() => setArmed(false)}
        className="text-neutral-400 hover:text-neutral-700"
      >
        cancel
      </button>
    </span>
  )
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
      className={`shrink-0 whitespace-nowrap rounded-full px-2 py-0.5 text-xs ${badge.className}`}
    >
      {badge.label}
    </span>
  )
}
