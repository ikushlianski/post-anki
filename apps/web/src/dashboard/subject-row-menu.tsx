import { useEffect, useRef, useState } from 'react'
import type { FormEvent, KeyboardEvent, MouseEvent as ReactMouseEvent } from 'react'
import { Link } from '@tanstack/react-router'

import type { Subject } from '../curriculum/model'

type MenuView = 'closed' | 'actions' | 'rename' | 'confirm-delete'

const NAVIGATION_KEYS = ['ArrowDown', 'ArrowUp', 'Home', 'End']
const ITEM_CLASS =
  'block w-full rounded px-3 py-2 text-left text-sm text-neutral-700 hover:bg-neutral-100 focus:bg-neutral-100 focus:outline-none'

export interface SubjectRowMenuProps {
  subject: Subject
  onRename: (subjectId: string, name: string) => Promise<boolean>
  onDelete: (subjectId: string) => Promise<boolean>
}

export function SubjectRowMenu({ subject, onRename, onDelete }: SubjectRowMenuProps) {
  const [view, setView] = useState<MenuView>('closed')
  const [draft, setDraft] = useState(subject.name)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const rootRef = useRef<HTMLDivElement>(null)
  const buttonRef = useRef<HTMLButtonElement>(null)
  const panelRef = useRef<HTMLDivElement>(null)
  const isOpen = view !== 'closed'

  useEffect(() => {
    if (view === 'actions') {
      panelRef.current?.querySelector<HTMLElement>('[role="menuitem"]')?.focus()
    }
  }, [view])

  useEffect(() => {
    if (!isOpen) {
      return
    }

    function handlePointerDown(event: MouseEvent) {
      if (!rootRef.current?.contains(event.target as Node)) {
        setView('closed')
        setError(null)
      }
    }

    document.addEventListener('mousedown', handlePointerDown)

    return () => document.removeEventListener('mousedown', handlePointerDown)
  }, [isOpen])

  function showView(next: MenuView) {
    setError(null)
    setDraft(subject.name)
    setView(next)
  }

  function close(restoreFocus: boolean) {
    setView('closed')
    setError(null)

    if (restoreFocus) {
      buttonRef.current?.focus()
    }
  }

  function handleTriggerClick(event: ReactMouseEvent<HTMLButtonElement>) {
    event.preventDefault()
    event.stopPropagation()

    if (isOpen) {
      close(true)

      return
    }

    showView('actions')
  }

  function getMenuItems(): HTMLElement[] {
    return Array.from(panelRef.current?.querySelectorAll<HTMLElement>('[role="menuitem"]') ?? [])
  }

  function handleKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (event.key === 'Escape') {
      event.preventDefault()
      close(true)

      return
    }

    if (event.key === 'Tab') {
      close(false)

      return
    }

    if (view !== 'actions' || !NAVIGATION_KEYS.includes(event.key)) {
      return
    }

    event.preventDefault()

    const items = getMenuItems()
    const current = items.indexOf(document.activeElement as HTMLElement)

    items[nextMenuIndex(event.key, current, items.length)]?.focus()
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

  return (
    <div ref={rootRef} className="relative shrink-0" onKeyDown={handleKeyDown}>
      <button
        ref={buttonRef}
        type="button"
        aria-label={`Actions for ${subject.name}`}
        aria-haspopup="menu"
        aria-expanded={isOpen}
        data-testid={`subject-menu-button-${subject.id}`}
        onClick={handleTriggerClick}
        className="flex h-8 w-8 items-center justify-center rounded-full text-lg leading-none text-neutral-400 hover:bg-neutral-100 hover:text-neutral-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 aria-expanded:bg-neutral-200 aria-expanded:text-neutral-700"
      >
        ⋯
      </button>

      {isOpen ? (
        <div
          ref={panelRef}
          role={view === 'actions' ? 'menu' : undefined}
          aria-label={`Actions for ${subject.name}`}
          className="absolute right-0 top-full z-20 mt-1 w-56 rounded-lg border border-neutral-200 bg-white p-1 shadow-lg"
        >
          {view === 'actions' ? (
            <>
              <Link
                to="/subject/$subjectId"
                params={{ subjectId: subject.id }}
                role="menuitem"
                data-testid={`subject-menu-open-${subject.id}`}
                className={ITEM_CLASS}
              >
                Open
              </Link>
              <button
                type="button"
                role="menuitem"
                data-testid={`subject-menu-rename-${subject.id}`}
                onClick={() => showView('rename')}
                className={ITEM_CLASS}
              >
                Rename
              </button>
              <button
                type="button"
                role="menuitem"
                data-testid={`subject-menu-delete-${subject.id}`}
                onClick={() => showView('confirm-delete')}
                className={`${ITEM_CLASS} text-red-600`}
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
        </div>
      ) : null}
    </div>
  )
}

function nextMenuIndex(key: string, current: number, count: number): number {
  if (key === 'Home') {
    return 0
  }

  if (key === 'End') {
    return count - 1
  }

  if (key === 'ArrowDown') {
    return (current + 1) % count
  }

  return (current - 1 + count) % count
}
