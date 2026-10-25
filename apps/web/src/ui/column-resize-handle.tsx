import { useRef } from 'react'
import type { KeyboardEvent, PointerEvent } from 'react'

import { MIN_COLUMN_WIDTH } from './use-column-widths'

const KEYBOARD_STEP = 16

export interface ColumnResizeHandleProps {
  label: string
  width: number
  onResize: (width: number) => void
  testId?: string
}

export function ColumnResizeHandle({ label, width, onResize, testId }: ColumnResizeHandleProps) {
  const drag = useRef<{ startX: number; startWidth: number } | null>(null)

  function onPointerDown(event: PointerEvent<HTMLDivElement>) {
    event.preventDefault()
    event.stopPropagation()
    event.currentTarget.setPointerCapture?.(event.pointerId)
    drag.current = { startX: event.clientX, startWidth: width }
  }

  function onPointerMove(event: PointerEvent<HTMLDivElement>) {
    if (drag.current) {
      onResize(drag.current.startWidth + event.clientX - drag.current.startX)
    }
  }

  function onPointerUp(event: PointerEvent<HTMLDivElement>) {
    drag.current = null
    event.currentTarget.releasePointerCapture?.(event.pointerId)
  }

  function onKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (event.key === 'ArrowRight') {
      event.preventDefault()
      event.stopPropagation()
      onResize(width + KEYBOARD_STEP)
    } else if (event.key === 'ArrowLeft') {
      event.preventDefault()
      event.stopPropagation()
      onResize(width - KEYBOARD_STEP)
    }
  }

  return (
    <div
      role="separator"
      aria-orientation="vertical"
      aria-label={`Resize ${label} column`}
      aria-valuenow={Math.round(width)}
      aria-valuemin={MIN_COLUMN_WIDTH}
      tabIndex={0}
      data-testid={testId}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
      onKeyDown={onKeyDown}
      onClick={(event) => event.stopPropagation()}
      className="absolute right-0 top-0 h-full w-2 cursor-col-resize touch-none select-none hover:bg-neutral-300 focus-visible:bg-neutral-400 focus-visible:outline-none"
    />
  )
}
