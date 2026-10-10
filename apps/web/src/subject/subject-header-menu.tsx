import { useRef, useState } from 'react'
import type { FormEvent } from 'react'
import { useRouter } from '@tanstack/react-router'

import type { Subject } from '../curriculum/model'
import { OVERFLOW_MENU_ITEM_CLASS, OverflowMenu, type OverflowMenuHandle } from '../ui/overflow-menu'
import { deleteSubject, updateSubjectName } from './subject.api'

type HeaderMenuView = 'closed' | 'actions' | 'rename' | 'confirm-delete'

export function SubjectHeaderMenu({ subject }: { subject: Subject }) {
  const router = useRouter()
  const menuRef = useRef<OverflowMenuHandle>(null)
  const [view, setView] = useState<HeaderMenuView>('closed')
  const [draft, setDraft] = useState(subject.name)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const isOpen = view !== 'closed'

  function showView(next: HeaderMenuView) {
    setError(null)
    setDraft(subject.name)
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

    let ok = false

    try {
      await updateSubjectName({ data: { subjectId: subject.id, name } })
      await router.invalidate()
      ok = true
    } catch {
      ok = false
    }

    setBusy(false)

    if (ok) {
      close(true)
    } else {
      setError('Rename failed — try again.')
    }
  }

  async function handleDelete() {
    setBusy(true)
    setError(null)

    try {
      await deleteSubject({ data: subject.id })
    } catch {
      setBusy(false)
      setError('Delete failed — try again.')

      return
    }

    await router.navigate({ to: '/' })
  }

  return (
    <OverflowMenu
      ref={menuRef}
      label={`Actions for ${subject.name}`}
      testId="subject-header-menu-button"
      open={isOpen}
      onOpenChange={handleOpenChange}
      panelRole={view === 'actions' ? 'menu' : undefined}
    >
      {view === 'actions' ? (
        <>
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
        <form onSubmit={handleRename} className="flex flex-col gap-2 p-2">
          <input
            value={draft}
            autoFocus
            disabled={busy}
            aria-label="Subject name"
            data-testid={`subject-rename-${subject.id}-input`}
            onChange={(event) => setDraft(event.target.value)}
            className="rounded border border-neutral-300 px-2 py-1 text-sm outline-none focus:border-neutral-500"
          />
          {error ? (
            <p role="alert" data-testid={`subject-rename-${subject.id}-error`} className="text-xs text-red-600">
              {error}
            </p>
          ) : null}
          <div className="flex justify-end gap-3 text-xs">
            <button
              type="button"
              disabled={busy}
              onClick={() => showView('actions')}
              data-testid={`subject-rename-${subject.id}-cancel`}
              className="text-neutral-500 hover:text-neutral-900"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={busy || draft.trim() === ''}
              data-testid={`subject-rename-${subject.id}-confirm`}
              className="font-medium text-indigo-600 hover:text-indigo-700 disabled:opacity-40"
            >
              Save
            </button>
          </div>
        </form>
      ) : null}

      {view === 'confirm-delete' ? (
        <div className="flex flex-col gap-2 p-2">
          <p className="text-sm text-neutral-700">Delete {subject.name}?</p>
          {error ? (
            <p role="alert" data-testid="delete-subject-error" className="text-xs text-red-600">
              {error}
            </p>
          ) : null}
          <div className="flex justify-end gap-3 text-xs">
            <button
              type="button"
              disabled={busy}
              onClick={() => showView('actions')}
              data-testid="delete-subject-cancel"
              className="text-neutral-500 hover:text-neutral-900"
            >
              Cancel
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={handleDelete}
              data-testid="delete-subject-confirm"
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
