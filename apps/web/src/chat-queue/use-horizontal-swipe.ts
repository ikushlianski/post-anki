import { useRef, type PointerEvent, type TouchEvent } from 'react'

export const HORIZONTAL_SWIPE_PX = 96

export type HorizontalSwipe = 'accept' | 'reject'

interface Point {
  x: number
  y: number
}

const INTERACTIVE_SELECTOR = 'textarea, input, select, button, a, summary, details, [data-no-drag]'

export function resolveHorizontalSwipe(start: Point, end: Point): HorizontalSwipe | null {
  const dx = end.x - start.x
  const dy = end.y - start.y

  if (Math.abs(dx) < HORIZONTAL_SWIPE_PX || Math.abs(dy) >= Math.abs(dx)) {
    return null
  }

  return dx > 0 ? 'accept' : 'reject'
}

function isInteractive(target: EventTarget | null): boolean {
  return target instanceof Element && target.closest(INTERACTIVE_SELECTOR) !== null
}

export function useHorizontalSwipe({
  enabled,
  onSwipe,
}: {
  enabled: boolean
  onSwipe: (direction: HorizontalSwipe) => void
}) {
  const start = useRef<Point | null>(null)

  function begin(target: EventTarget | null, point: Point) {
    start.current = enabled && !isInteractive(target) ? point : null
  }

  function finish(point: Point) {
    const from = start.current

    start.current = null

    if (!from || (window.getSelection()?.toString() ?? '') !== '') {
      return
    }

    const direction = resolveHorizontalSwipe(from, point)

    if (direction) {
      onSwipe(direction)
    }
  }

  return {
    onTouchStart: (event: TouchEvent<HTMLElement>) => {
      const touch = event.changedTouches[0]

      if (event.touches.length === 1 && touch) {
        begin(event.target, { x: touch.clientX, y: touch.clientY })
      } else {
        start.current = null
      }
    },
    onTouchEnd: (event: TouchEvent<HTMLElement>) => {
      const touch = event.changedTouches[0]

      if (touch) {
        finish({ x: touch.clientX, y: touch.clientY })
      }
    },
    onTouchCancel: () => {
      start.current = null
    },
    onPointerDown: (event: PointerEvent<HTMLElement>) => {
      if (event.pointerType === 'pen') {
        begin(event.target, { x: event.clientX, y: event.clientY })
      }
    },
    onPointerUp: (event: PointerEvent<HTMLElement>) => {
      if (event.pointerType === 'pen') {
        finish({ x: event.clientX, y: event.clientY })
      }
    },
    onPointerCancel: (event: PointerEvent<HTMLElement>) => {
      if (event.pointerType === 'pen') {
        start.current = null
      }
    },
  }
}
