import { useEffect, useRef, useState } from 'react'
import type { CSSProperties, ReactNode } from 'react'

interface ToolbarPopoverProps {
  buttonLabel: string
  buttonContent: ReactNode
  buttonClassName: string
  testId: string
  children: ReactNode | ((close: () => void) => ReactNode)
  placement?: 'toolbar' | 'sheet' | 'fixed'
  panelWidthClass?: string
}

const PLACEMENT_CLASS = {
  toolbar: 'absolute left-0 top-full z-40 mt-1',
  sheet: 'absolute inset-x-0 top-full z-40 mt-1 sm:inset-x-auto sm:left-0',
  fixed: 'fixed z-50',
} as const

export function KnowledgeBrowserToolbarPopover({
  buttonLabel,
  buttonContent,
  buttonClassName,
  testId,
  children,
  placement = 'toolbar',
  panelWidthClass = 'w-72',
}: ToolbarPopoverProps) {
  const [open, setOpen] = useState(false)
  const [fixedStyle, setFixedStyle] = useState<CSSProperties>({})
  const wrapperRef = useRef<HTMLSpanElement>(null)
  const buttonRef = useRef<HTMLButtonElement>(null)

  function toggle() {
    if (!open && placement === 'fixed' && buttonRef.current) {
      const rect = buttonRef.current.getBoundingClientRect()

      setFixedStyle({ top: rect.bottom + 4, left: Math.max(8, rect.left) })
    }

    setOpen(!open)
  }

  useEffect(() => {
    if (!open) {
      return
    }

    function onPointerDown(event: MouseEvent) {
      if (wrapperRef.current && !wrapperRef.current.contains(event.target as Node)) {
        setOpen(false)
      }
    }

    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        event.stopPropagation()
        setOpen(false)
        buttonRef.current?.focus()
      }
    }

    document.addEventListener('mousedown', onPointerDown)
    document.addEventListener('keydown', onKeyDown, true)

    return () => {
      document.removeEventListener('mousedown', onPointerDown)
      document.removeEventListener('keydown', onKeyDown, true)
    }
  }, [open])

  return (
    <span
      ref={wrapperRef}
      className={placement === 'sheet' ? 'static sm:relative' : placement === 'fixed' ? 'inline-flex' : 'relative'}
    >
      <button
        ref={buttonRef}
        type="button"
        aria-label={buttonLabel}
        aria-expanded={open}
        aria-haspopup="dialog"
        data-testid={testId}
        className={buttonClassName}
        onClick={toggle}
      >
        {buttonContent}
      </button>
      {open && (
        <div
          role="dialog"
          aria-label={buttonLabel}
          data-testid={`${testId}-panel`}
          style={placement === 'fixed' ? fixedStyle : undefined}
          className={`${PLACEMENT_CLASS[placement]} ${panelWidthClass} max-h-[70vh] overflow-y-auto rounded border border-neutral-300 bg-white p-3 text-left text-sm font-normal shadow-lg`}
        >
          {typeof children === 'function' ? children(() => setOpen(false)) : children}
        </div>
      )}
    </span>
  )
}
