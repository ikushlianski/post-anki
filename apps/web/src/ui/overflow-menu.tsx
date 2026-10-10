import { useEffect, useImperativeHandle, useRef, useState } from 'react'
import type { KeyboardEvent, MouseEvent as ReactMouseEvent, ReactNode, Ref } from 'react'

const NAVIGATION_KEYS = ['ArrowDown', 'ArrowUp', 'Home', 'End']
const FOCUSABLE_SELECTOR = 'input:not(:disabled), button:not(:disabled), a[href]'

export const OVERFLOW_MENU_ITEM_CLASS =
  'block w-full rounded px-3 py-2 text-left text-sm text-neutral-700 hover:bg-neutral-100 focus:bg-neutral-100 focus:outline-none'

export interface OverflowMenuHandle {
  focusTrigger: () => void
  focusFirstControl: () => void
}

export interface OverflowMenuProps {
  label: string
  testId?: string
  open: boolean
  viewKey: string
  onOpenChange: (open: boolean) => void
  panelRole?: 'menu' | 'dialog'
  ref?: Ref<OverflowMenuHandle>
  children: ReactNode
}

export function OverflowMenu({
  label,
  testId,
  open,
  viewKey,
  onOpenChange,
  panelRole = 'dialog',
  ref,
  children,
}: OverflowMenuProps) {
  const rootRef = useRef<HTMLDivElement>(null)
  const buttonRef = useRef<HTMLButtonElement>(null)
  const panelRef = useRef<HTMLDivElement>(null)
  const [focusRequest, setFocusRequest] = useState(0)

  useImperativeHandle(
    ref,
    () => ({
      focusTrigger: () => buttonRef.current?.focus(),
      focusFirstControl: () => setFocusRequest((count) => count + 1),
    }),
    [],
  )

  useEffect(() => {
    if (open) {
      panelRef.current?.querySelector<HTMLElement>(FOCUSABLE_SELECTOR)?.focus()
    }
  }, [open, viewKey, focusRequest])

  useEffect(() => {
    if (!open) {
      return
    }

    function handlePointerDown(event: MouseEvent) {
      if (!rootRef.current?.contains(event.target as Node)) {
        onOpenChange(false)
      }
    }

    document.addEventListener('mousedown', handlePointerDown)

    return () => document.removeEventListener('mousedown', handlePointerDown)
  }, [open, onOpenChange])

  function close(restoreFocus: boolean) {
    onOpenChange(false)

    if (restoreFocus) {
      buttonRef.current?.focus()
    }
  }

  function handleTriggerClick(event: ReactMouseEvent<HTMLButtonElement>) {
    event.preventDefault()
    event.stopPropagation()

    if (open) {
      close(true)

      return
    }

    onOpenChange(true)
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

    if (event.key === 'Tab' && panelRole === 'menu') {
      close(false)

      return
    }

    if (panelRole !== 'menu' || !NAVIGATION_KEYS.includes(event.key)) {
      return
    }

    event.preventDefault()

    const items = getMenuItems()
    const current = items.indexOf(document.activeElement as HTMLElement)

    items[nextMenuIndex(event.key, current, items.length)]?.focus()
  }

  return (
    <div ref={rootRef} className="relative shrink-0" onKeyDown={handleKeyDown}>
      <button
        ref={buttonRef}
        type="button"
        aria-label={label}
        aria-haspopup="menu"
        aria-expanded={open}
        data-testid={testId}
        onClick={handleTriggerClick}
        className="flex h-8 w-8 items-center justify-center rounded-full text-lg leading-none text-neutral-400 hover:bg-neutral-100 hover:text-neutral-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 aria-expanded:bg-neutral-200 aria-expanded:text-neutral-700"
      >
        ⋯
      </button>

      {open ? (
        <div
          ref={panelRef}
          role={panelRole}
          aria-label={label}
          className="absolute right-0 top-full z-20 mt-1 w-56 rounded-lg border border-neutral-200 bg-white p-1 shadow-lg"
        >
          {children}
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
