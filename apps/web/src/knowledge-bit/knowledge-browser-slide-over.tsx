import { useEffect, useRef } from 'react'
import type { ReactNode } from 'react'

import { useMobileScrollLock } from './use-keyboard-offset'

export const BROWSER_ROW_SELECTOR = '[data-testid="knowledge-browser-row"]'

interface KnowledgeBrowserSlideOverProps {
  title: string
  onClose: () => void
  getReturnFocus?: () => HTMLElement | null
  children: ReactNode
}

export function KnowledgeBrowserSlideOver({
  title,
  onClose,
  getReturnFocus,
  children,
}: KnowledgeBrowserSlideOverProps) {
  const panelRef = useRef<HTMLDivElement>(null)
  const backdropRef = useRef<HTMLButtonElement>(null)
  const onCloseRef = useRef(onClose)
  const getReturnFocusRef = useRef(getReturnFocus)

  onCloseRef.current = onClose
  getReturnFocusRef.current = getReturnFocus

  useMobileScrollLock(true)

  useEffect(() => {
    const opener = document.activeElement instanceof HTMLElement ? document.activeElement : null

    panelRef.current?.focus()

    return () => {
      const target = getReturnFocusRef.current?.() ?? opener

      if (target?.isConnected) {
        target.focus()
      }
    }
  }, [])

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.key !== 'Escape' || event.isComposing) {
        return
      }

      event.preventDefault()
      event.stopPropagation()
      onCloseRef.current()
    }

    function onPointerDown(event: MouseEvent) {
      const target = event.target

      if (!(target instanceof Element) || panelRef.current?.contains(target)) {
        return
      }

      if (target === backdropRef.current || target.closest(BROWSER_ROW_SELECTOR)) {
        return
      }

      onCloseRef.current()
    }

    window.addEventListener('keydown', onKeyDown, true)
    document.addEventListener('mousedown', onPointerDown)

    return () => {
      window.removeEventListener('keydown', onKeyDown, true)
      document.removeEventListener('mousedown', onPointerDown)
    }
  }, [])

  return (
    <>
      <button
        ref={backdropRef}
        type="button"
        tabIndex={-1}
        aria-label="Close details"
        data-testid="knowledge-browser-slide-over-backdrop"
        onClick={onClose}
        className="fixed inset-0 z-40 bg-black/40 sm:hidden"
      />
      <div
        ref={panelRef}
        tabIndex={-1}
        role="dialog"
        aria-label={title}
        data-testid="knowledge-browser-slide-over"
        className="fixed inset-y-0 right-0 z-50 flex w-full flex-col bg-white shadow-xl outline-none sm:w-[28rem] sm:border-l sm:border-neutral-200"
      >
        <div className="flex items-center justify-between gap-2 border-b border-neutral-200 px-4 py-3">
          <h2 className="truncate text-sm font-semibold text-neutral-900">{title}</h2>
          <button
            type="button"
            aria-label="Close"
            data-testid="knowledge-browser-slide-over-close"
            onClick={onClose}
            className="rounded px-2 py-1 text-sm text-neutral-600 hover:bg-neutral-100"
          >
            Close
          </button>
        </div>
        <div
          data-testid="knowledge-browser-slide-over-body"
          className="min-h-0 flex-1 overflow-y-auto px-4 py-3"
        >
          {children}
        </div>
      </div>
    </>
  )
}
