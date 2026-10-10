import { Link } from '@tanstack/react-router'

import type { Subject } from '../curriculum/model'
import { SubjectDeleteConfirm } from '../subject/subject-delete-confirm'
import { SubjectMovePicker } from '../subject/subject-move-picker'
import { SubjectNameForm } from '../subject/subject-name-form'
import { buildMoveOptions, countDirectSubSubjects } from '../subject/subject-menu-model'
import { useSubjectMenuState } from '../subject/subject-menu-state'
import { useLiveCurriculumCount } from '../subject/subject-live-data'
import { focusPageHeading } from '../ui/focus-page-heading'
import { OVERFLOW_MENU_ITEM_CLASS, OverflowMenu } from '../ui/overflow-menu'

export interface SubjectRowMenuProps {
  subject: Subject
  allSubjects: Subject[]
  onRename: (subjectId: string, name: string) => Promise<boolean>
  onDelete: (subjectId: string) => Promise<boolean>
  onCreateSubSubject: (parentId: string, name: string) => Promise<boolean>
  onMoveSubject: (subjectId: string, parentId: string | null) => Promise<boolean>
}

export function SubjectRowMenu({
  subject,
  allSubjects,
  onRename,
  onDelete,
  onCreateSubSubject,
  onMoveSubject,
}: SubjectRowMenuProps) {
  const menu = useSubjectMenuState()
  const curriculumCount = useLiveCurriculumCount(subject.id)
  const { view, busy, error, menuRef, attempt, showView, close } = menu

  async function handleRename(name: string) {
    if (name === subject.name) {
      close(true)

      return
    }

    const ok = await attempt(() => onRename(subject.id, name), 'Rename failed — try again.')

    if (ok) {
      close(true)
    }
  }

  async function handleAddSubSubject(name: string) {
    const ok = await attempt(
      () => onCreateSubSubject(subject.id, name),
      'Create failed — try again.',
    )

    if (ok) {
      close(true)
    }
  }

  async function handleMove(parentId: string | null) {
    const ok = await attempt(() => onMoveSubject(subject.id, parentId), 'Move failed — try again.')

    if (ok) {
      close(true)
    }
  }

  async function handleDelete() {
    const ok = await attempt(() => onDelete(subject.id), 'Delete failed — try again.')

    if (ok) {
      close(false)
      focusPageHeading()
    }
  }

  return (
    <OverflowMenu
      ref={menuRef}
      label={`Actions for ${subject.name}`}
      testId={`subject-menu-button-${subject.id}`}
      open={menu.isOpen}
      viewKey={view}
      onOpenChange={menu.handleOpenChange}
      panelRole={view === 'actions' ? 'menu' : 'dialog'}
    >
      {view === 'actions' ? (
        <>
          <Link
            to="/subject/$subjectId"
            params={{ subjectId: subject.id }}
            role="menuitem"
            data-testid={`subject-menu-open-${subject.id}`}
            className={OVERFLOW_MENU_ITEM_CLASS}
          >
            Open
          </Link>
          <Link
            to="/knowledge/review"
            search={{ subjectId: subject.id }}
            role="menuitem"
            data-testid={`subject-menu-review-${subject.id}`}
            className={OVERFLOW_MENU_ITEM_CLASS}
          >
            Review
          </Link>
          <button
            type="button"
            role="menuitem"
            data-testid={`subject-menu-add-child-${subject.id}`}
            onClick={() => showView('add-child')}
            className={OVERFLOW_MENU_ITEM_CLASS}
          >
            Add sub-subject
          </button>
          <button
            type="button"
            role="menuitem"
            data-testid={`subject-menu-move-${subject.id}`}
            onClick={() => showView('move')}
            className={OVERFLOW_MENU_ITEM_CLASS}
          >
            Move under…
          </button>
          <button
            type="button"
            role="menuitem"
            data-testid={`subject-menu-rename-${subject.id}`}
            onClick={() => showView('rename')}
            className={OVERFLOW_MENU_ITEM_CLASS}
          >
            Rename
          </button>
          <button
            type="button"
            role="menuitem"
            data-testid={`subject-menu-delete-${subject.id}`}
            onClick={() => showView('confirm-delete')}
            className={`${OVERFLOW_MENU_ITEM_CLASS} text-red-600`}
          >
            Delete subject
          </button>
        </>
      ) : null}

      {view === 'rename' ? (
        <SubjectNameForm
          initialValue={subject.name}
          ariaLabel="Subject name"
          submitLabel="Save name"
          busy={busy}
          error={error}
          onSubmit={handleRename}
          onCancel={() => showView('actions')}
        />
      ) : null}

      {view === 'add-child' ? (
        <SubjectNameForm
          initialValue=""
          ariaLabel="Sub-subject name"
          placeholder="Sub-subject name"
          submitLabel="Add sub-subject"
          busy={busy}
          error={error}
          testIds={{
            input: `subject-menu-add-child-input-${subject.id}`,
            submit: `subject-menu-add-child-submit-${subject.id}`,
          }}
          onSubmit={handleAddSubSubject}
          onCancel={() => showView('actions')}
        />
      ) : null}

      {view === 'move' ? (
        <SubjectMovePicker
          options={buildMoveOptions(subject.id, subject.parentId, allSubjects)}
          currentParentId={subject.parentId}
          busy={busy}
          error={error}
          emptyNotice="No other subjects yet."
          testIds={{
            top: `subject-menu-move-top-${subject.id}`,
            target: (parentId) => `subject-menu-move-target-${parentId}`,
          }}
          onMove={handleMove}
          onCancel={() => showView('actions')}
        />
      ) : null}

      {view === 'confirm-delete' ? (
        <SubjectDeleteConfirm
          subjectName={subject.name}
          curriculumCount={curriculumCount}
          subSubjectCount={countDirectSubSubjects(subject.id, allSubjects)}
          busy={busy}
          error={error}
          testIds={{
            confirm: `subject-menu-confirm-delete-${subject.id}`,
            cancel: `subject-menu-cancel-delete-${subject.id}`,
            error: `subject-menu-delete-error-${subject.id}`,
          }}
          onConfirm={handleDelete}
          onCancel={() => showView('actions')}
        />
      ) : null}
    </OverflowMenu>
  )
}
