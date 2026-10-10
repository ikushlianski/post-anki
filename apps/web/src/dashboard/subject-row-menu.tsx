import { useRef, useState } from 'react'
import type { FormEvent } from 'react'
import { Link } from '@tanstack/react-router'
import { buildSubjectPathLabel, listValidMoveTargets } from '@post-anki/core'

import type { Subject } from '../curriculum/model'
import {
  OVERFLOW_MENU_ITEM_CLASS,
  OverflowMenu,
  type OverflowMenuHandle,
} from '../ui/overflow-menu'

type MenuView = 'closed' | 'actions' | 'rename' | 'confirm-delete' | 'add-child' | 'move'

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
  const [view, setView] = useState<MenuView>('closed')
  const [draft, setDraft] = useState(subject.name)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const menuRef = useRef<OverflowMenuHandle>(null)
  const isOpen = view !== 'closed'

  function showView(next: MenuView) {
    setError(null)
    setDraft(next === 'add-child' ? '' : subject.name)
    setView(next)
  }

  function handleOpenChange(next: boolean) {
    if (next) {
      showView('actions')

      return
    }

    setView('closed')
    setError(null)
  }

  function close(restoreFocus: boolean) {
    handleOpenChange(false)

    if (restoreFocus) {
      menuRef.current?.focusTrigger()
    }
  }

  async function handleRename(event: FormEvent) {
    event.preventDefault()

    const name = draft.trim()

    if (!name) {
      return
    }

    if (name === subject.name) {
      close(true)

      return
    }

    setBusy(true)
    setError(null)

    const ok = await onRename(subject.id, name)

    setBusy(false)

    if (ok) {
      close(true)
    } else {
      setError('Rename failed — try again.')
    }
  }

  async function handleAddSubSubject(event: FormEvent) {
    event.preventDefault()

    const name = draft.trim()

    if (!name) {
      return
    }

    setBusy(true)
    setError(null)

    const ok = await onCreateSubSubject(subject.id, name)

    setBusy(false)

    if (ok) {
      close(true)
    } else {
      setError('Create failed — try again.')
    }
  }

  async function handleMove(parentId: string | null) {
    if (parentId === subject.parentId) {
      close(true)

      return
    }

    setBusy(true)
    setError(null)

    const ok = await onMoveSubject(subject.id, parentId)

    setBusy(false)

    if (ok) {
      close(true)
    } else {
      setError('Move failed — try again.')
    }
  }

  async function handleDelete() {
    setBusy(true)
    setError(null)

    const ok = await onDelete(subject.id)

    setBusy(false)

    if (ok) {
      close(false)
    } else {
      setError('Delete failed — try again.')
    }
  }

  const moveTargets = listValidMoveTargets(subject.id, allSubjects)
    .map((target) => ({ id: target.id, label: buildSubjectPathLabel(target.id, allSubjects) }))
    .sort((a, b) => a.label.localeCompare(b.label))

  return (
    <OverflowMenu
      ref={menuRef}
      label={`Actions for ${subject.name}`}
      testId={`subject-menu-button-${subject.id}`}
      open={isOpen}
      onOpenChange={handleOpenChange}
      panelRole={view === 'actions' ? 'menu' : undefined}
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
        <form onSubmit={handleRename} className="flex flex-col gap-2 p-2">
          <input
            value={draft}
            autoFocus
            disabled={busy}
            aria-label="Subject name"
            onChange={(event) => setDraft(event.target.value)}
            className="rounded border border-neutral-300 px-2 py-1 text-sm outline-none focus:border-neutral-500"
          />
          {error ? (
            <p role="alert" className="text-xs text-red-600">
              {error}
            </p>
          ) : null}
          <div className="flex justify-end gap-3 text-xs">
            <button
              type="button"
              disabled={busy}
              onClick={() => showView('actions')}
              className="text-neutral-500 hover:text-neutral-900"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={busy || draft.trim() === ''}
              className="font-medium text-indigo-600 hover:text-indigo-700 disabled:opacity-40"
            >
              Save name
            </button>
          </div>
        </form>
      ) : null}

      {view === 'add-child' ? (
        <form onSubmit={handleAddSubSubject} className="flex flex-col gap-2 p-2">
          <input
            value={draft}
            autoFocus
            disabled={busy}
            placeholder="Sub-subject name"
            aria-label="Sub-subject name"
            onChange={(event) => setDraft(event.target.value)}
            data-testid={`subject-menu-add-child-input-${subject.id}`}
            className="rounded border border-neutral-300 px-2 py-1 text-sm outline-none focus:border-neutral-500"
          />
          {error ? (
            <p role="alert" className="text-xs text-red-600">
              {error}
            </p>
          ) : null}
          <div className="flex justify-end gap-3 text-xs">
            <button
              type="button"
              disabled={busy}
              onClick={() => showView('actions')}
              className="text-neutral-500 hover:text-neutral-900"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={busy || draft.trim() === ''}
              data-testid={`subject-menu-add-child-submit-${subject.id}`}
              className="font-medium text-indigo-600 hover:text-indigo-700 disabled:opacity-40"
            >
              Add sub-subject
            </button>
          </div>
        </form>
      ) : null}

      {view === 'move' ? (
        <div className="flex max-h-72 flex-col gap-1 overflow-y-auto p-1">
          <p className="px-3 py-1 text-xs text-neutral-500">Move under…</p>
          <button
            type="button"
            role="menuitem"
            disabled={busy}
            data-testid={`subject-menu-move-top-${subject.id}`}
            onClick={() => handleMove(null)}
            className={OVERFLOW_MENU_ITEM_CLASS}
          >
            Top level
          </button>
          {moveTargets.map((target) => (
            <button
              key={target.id}
              type="button"
              role="menuitem"
              disabled={busy}
              data-testid={`subject-menu-move-target-${target.id}`}
              onClick={() => handleMove(target.id)}
              className={OVERFLOW_MENU_ITEM_CLASS}
            >
              {target.label}
            </button>
          ))}
          {error ? (
            <p role="alert" className="px-3 text-xs text-red-600">
              {error}
            </p>
          ) : null}
          <div className="flex justify-end px-3 pt-1 text-xs">
            <button
              type="button"
              disabled={busy}
              onClick={() => showView('actions')}
              className="text-neutral-500 hover:text-neutral-900"
            >
              Cancel
            </button>
          </div>
        </div>
      ) : null}

      {view === 'confirm-delete' ? (
        <div className="flex flex-col gap-2 p-2">
          <p className="text-sm text-neutral-700">Delete {subject.name}?</p>
          {error ? (
            <p role="alert" className="text-xs text-red-600">
              {error}
            </p>
          ) : null}
          <div className="flex justify-end gap-3 text-xs">
            <button
              type="button"
              disabled={busy}
              onClick={() => showView('actions')}
              className="text-neutral-500 hover:text-neutral-900"
            >
              Cancel
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={handleDelete}
              data-testid={`subject-menu-confirm-delete-${subject.id}`}
              className="font-medium text-red-600 hover:text-red-700 disabled:opacity-40"
            >
              Delete
            </button>
          </div>
        </div>
      ) : null}
    </OverflowMenu>
  )
}
