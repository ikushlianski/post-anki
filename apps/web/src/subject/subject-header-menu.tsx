import { useRouter } from '@tanstack/react-router'

import type { Subject } from '../curriculum/model'
import { focusPageHeading } from '../ui/focus-page-heading'
import { OVERFLOW_MENU_ITEM_CLASS, OverflowMenu } from '../ui/overflow-menu'
import { createSubject, deleteSubject, updateSubjectName, updateSubjectParent } from './subject.api'
import { SubjectDeleteConfirm } from './subject-delete-confirm'
import { SubjectMovePicker } from './subject-move-picker'
import { SubjectNameForm } from './subject-name-form'
import { buildMoveOptions, countDirectSubSubjects } from './subject-menu-model'
import { useLiveCurriculumCount, useLiveSubjects } from './subject-live-data'
import { useSubjectMenuState } from './subject-menu-state'

export function SubjectHeaderMenu({ subject }: { subject: Subject }) {
  const router = useRouter()
  const menu = useSubjectMenuState()
  const { view, busy, error, menuRef, attempt, showView, close } = menu
  const subjects = useLiveSubjects()
  const curriculumCount = useLiveCurriculumCount(subject.id)

  async function refreshAfter(action: () => Promise<unknown>): Promise<boolean> {
    try {
      await action()
      await router.invalidate()

      return true
    } catch {
      return false
    }
  }

  async function handleRename(name: string) {
    if (name === subject.name) {
      close(true)

      return
    }

    const ok = await attempt(
      () => refreshAfter(() => updateSubjectName({ data: { subjectId: subject.id, name } })),
      'Rename failed — try again.',
    )

    if (ok) {
      close(true)
    }
  }

  async function handleAddSubSubject(name: string) {
    const ok = await attempt(
      () =>
        refreshAfter(() =>
          createSubject({ data: { name, kind: 'architecture-mentor', parentId: subject.id } }),
        ),
      'Create failed — try again.',
    )

    if (ok) {
      close(true)
    }
  }

  async function handleMove(parentId: string | null) {
    const ok = await attempt(
      () => refreshAfter(() => updateSubjectParent({ data: { subjectId: subject.id, parentId } })),
      'Move failed — try again.',
    )

    if (ok) {
      close(true)
    }
  }

  async function handleDelete() {
    const ok = await attempt(async () => {
      try {
        await deleteSubject({ data: subject.id })

        return true
      } catch {
        return false
      }
    }, 'Delete failed — try again.')

    if (ok) {
      await router.navigate({ to: '/' })
      focusPageHeading()
    }
  }

  return (
    <OverflowMenu
      ref={menuRef}
      label={`Actions for ${subject.name}`}
      testId="subject-header-menu-button"
      open={menu.isOpen}
      viewKey={view}
      onOpenChange={menu.handleOpenChange}
      panelRole={view === 'actions' ? 'menu' : 'dialog'}
    >
      {view === 'actions' ? (
        <>
          <button
            type="button"
            role="menuitem"
            data-testid="subject-header-menu-add-child"
            onClick={() => showView('add-child')}
            className={OVERFLOW_MENU_ITEM_CLASS}
          >
            Add sub-subject
          </button>
          <button
            type="button"
            role="menuitem"
            data-testid="subject-header-menu-move"
            onClick={() => showView('move')}
            className={OVERFLOW_MENU_ITEM_CLASS}
          >
            Move under…
          </button>
          <button
            type="button"
            role="menuitem"
            data-testid={`subject-rename-${subject.id}-button`}
            onClick={() => showView('rename')}
            className={OVERFLOW_MENU_ITEM_CLASS}
          >
            Rename
          </button>
          <button
            type="button"
            role="menuitem"
            data-testid="delete-subject-button"
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
          submitLabel="Save"
          busy={busy}
          error={error}
          testIds={{
            input: `subject-rename-${subject.id}-input`,
            error: `subject-rename-${subject.id}-error`,
            cancel: `subject-rename-${subject.id}-cancel`,
            submit: `subject-rename-${subject.id}-confirm`,
          }}
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
          testIds={{ input: 'subject-header-add-child-input', submit: 'subject-header-add-child-submit' }}
          onSubmit={handleAddSubSubject}
          onCancel={() => showView('actions')}
        />
      ) : null}

      {view === 'move' ? (
        <SubjectMovePicker
          options={buildMoveOptions(subject.id, subject.parentId, subjects ?? [])}
          currentParentId={subject.parentId}
          busy={busy}
          error={error}
          emptyNotice={subjects === null ? 'Loading subjects…' : 'No other subjects yet.'}
          testIds={{
            top: 'subject-header-move-top',
            target: (parentId) => `subject-header-move-target-${parentId}`,
          }}
          onMove={handleMove}
          onCancel={() => showView('actions')}
        />
      ) : null}

      {view === 'confirm-delete' ? (
        <SubjectDeleteConfirm
          subjectName={subject.name}
          curriculumCount={curriculumCount}
          subSubjectCount={subjects === null ? null : countDirectSubSubjects(subject.id, subjects)}
          busy={busy}
          error={error}
          testIds={{
            confirm: 'delete-subject-confirm',
            cancel: 'delete-subject-cancel',
            error: 'delete-subject-error',
          }}
          onConfirm={handleDelete}
          onCancel={() => showView('actions')}
        />
      ) : null}
    </OverflowMenu>
  )
}
