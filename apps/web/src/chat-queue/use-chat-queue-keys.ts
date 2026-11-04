import { useEffect, useRef } from "react";

import { isTypingTarget } from "../knowledge-bit/knowledge-bit-review-keyboard";

export function useChatQueueKeys({
  enabled,
  onMove,
  onOpen,
  onToggle,
  onInbox,
  onSnooze,
}: {
  enabled: boolean;
  onMove: (delta: 1 | -1) => void;
  onOpen: () => void;
  onToggle?: () => void;
  onInbox?: () => void;
  onSnooze?: () => void;
}): void {
  const handlers = useRef({ onMove, onOpen, onToggle, onInbox, onSnooze });

  handlers.current = { onMove, onOpen, onToggle, onInbox, onSnooze };

  useEffect(() => {
    if (!enabled) return undefined;

    function onKeyDown(event: KeyboardEvent) {
      if (event.ctrlKey || event.metaKey || event.altKey || event.shiftKey)
        return;

      if (event.defaultPrevented || isTypingTarget(event.target)) return;

      if (event.key === "j" || event.key === "k") {
        event.preventDefault();
        handlers.current.onMove(event.key === "j" ? 1 : -1);
      } else if (event.key === "x") {
        event.preventDefault();
        handlers.current.onToggle?.();
      } else if (event.key === "i") {
        event.preventDefault();
        handlers.current.onInbox?.();
      } else if (event.key === "s") {
        event.preventDefault();
        handlers.current.onSnooze?.();
      } else if (event.key === "Enter") {
        const tag = (event.target as HTMLElement | null)?.tagName;

        if (tag === "BUTTON" || tag === "A") return;

        event.preventDefault();
        handlers.current.onOpen();
      }
    }

    window.addEventListener("keydown", onKeyDown);

    return () => window.removeEventListener("keydown", onKeyDown);
  }, [enabled]);
}
