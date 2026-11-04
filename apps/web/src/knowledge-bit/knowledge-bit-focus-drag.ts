import { useRef, type PointerEvent, type TouchEvent } from "react";

export const VERTICAL_DRAG_PX = 96;

export type VerticalDrag = "down" | "up";

interface ScrollEdges {
  atTop: boolean;
  atBottom: boolean;
}

interface DragStart extends ScrollEdges {
  y: number;
}

const INTERACTIVE_SELECTOR =
  "textarea, input, select, button, a, summary, details, [data-no-drag]";

export function readScrollEdges(element: HTMLElement): ScrollEdges {
  return {
    atTop: element.scrollTop <= 0,
    atBottom:
      element.scrollTop + element.clientHeight >= element.scrollHeight - 1,
  };
}

export function resolveVerticalDrag(
  start: DragStart,
  endY: number,
  end: ScrollEdges,
): VerticalDrag | null {
  const delta = endY - start.y;

  if (delta >= VERTICAL_DRAG_PX && start.atTop && end.atTop) {
    return "down";
  }

  if (delta <= -VERTICAL_DRAG_PX && start.atBottom && end.atBottom) {
    return "up";
  }

  return null;
}

function isInteractive(target: EventTarget | null): boolean {
  return (
    target instanceof Element && target.closest(INTERACTIVE_SELECTOR) !== null
  );
}

export function useVerticalDrag({
  enabled,
  onDrag,
}: {
  enabled: boolean;
  onDrag: (direction: VerticalDrag) => void;
}) {
  const start = useRef<DragStart | null>(null);

  function begin(element: HTMLElement, target: EventTarget | null, y: number) {
    start.current =
      enabled && !isInteractive(target)
        ? { y, ...readScrollEdges(element) }
        : null;
  }

  function finish(element: HTMLElement, y: number) {
    const from = start.current;

    start.current = null;

    if (!from || (window.getSelection()?.toString() ?? "") !== "") {
      return;
    }

    const direction = resolveVerticalDrag(from, y, readScrollEdges(element));

    if (direction) {
      onDrag(direction);
    }
  }

  return {
    onTouchStart: (event: TouchEvent<HTMLElement>) => {
      const touch = event.changedTouches[0];

      if (event.touches.length === 1 && touch) {
        begin(event.currentTarget, event.target, touch.clientY);
      } else {
        start.current = null;
      }
    },
    onTouchEnd: (event: TouchEvent<HTMLElement>) => {
      const touch = event.changedTouches[0];

      if (touch) {
        finish(event.currentTarget, touch.clientY);
      }
    },
    onTouchCancel: () => {
      start.current = null;
    },
    onPointerDown: (event: PointerEvent<HTMLElement>) => {
      if (event.pointerType === "pen") {
        begin(event.currentTarget, event.target, event.clientY);
      }
    },
    onPointerUp: (event: PointerEvent<HTMLElement>) => {
      if (event.pointerType === "pen") {
        finish(event.currentTarget, event.clientY);
      }
    },
    onPointerCancel: (event: PointerEvent<HTMLElement>) => {
      if (event.pointerType === "pen") {
        start.current = null;
      }
    },
  };
}
