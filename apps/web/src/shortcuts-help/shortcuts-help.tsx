import { useEffect, useRef } from "react";

import { isTypingTarget } from "../knowledge-bit/knowledge-bit-review-keyboard";
import { SECONDARY_BUTTON_CLASS } from "../knowledge-bit/knowledge-bit-review-classes";
import type { Shortcut } from "./shortcut";

export function ShortcutsHelp({
  open,
  shortcuts,
  testId = "shortcuts-dialog",
  onOpenChange,
}: {
  open: boolean;
  shortcuts: readonly Shortcut[];
  testId?: string;
  onOpenChange: (open: boolean) => void;
}) {
  const closeRef = useRef<HTMLButtonElement>(null);
  const returnFocusRef = useRef<HTMLElement | null>(null);

  function close() {
    onOpenChange(false);
    returnFocusRef.current?.focus();
    returnFocusRef.current = null;
  }

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (open) {
        if (event.key === "Escape" || event.key === "?") {
          event.preventDefault();
          close();
        } else if (event.key === "Tab") {
          event.preventDefault();
          closeRef.current?.focus();
        }

        return;
      }

      if (event.defaultPrevented) return;

      if (event.key !== "?" || event.ctrlKey || event.metaKey || event.altKey)
        return;

      if (isTypingTarget(event.target)) return;

      event.preventDefault();
      returnFocusRef.current =
        document.activeElement instanceof HTMLElement
          ? document.activeElement
          : null;
      onOpenChange(true);
    }

    function blockBehind(event: KeyboardEvent) {
      if (!open) return;

      if (event.key === "Escape" || event.key === "?" || event.key === "Tab")
        return;

      event.stopImmediatePropagation();
    }

    window.addEventListener("keydown", blockBehind, true);
    window.addEventListener("keydown", onKeyDown);

    return () => {
      window.removeEventListener("keydown", blockBehind, true);
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [open, onOpenChange]);

  useEffect(() => {
    if (open) closeRef.current?.focus();
  }, [open]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="shortcuts-help-title"
        data-testid={testId}
        className="w-full max-w-sm rounded-lg bg-white p-5 shadow-lg"
      >
        <h2 id="shortcuts-help-title" className="text-lg font-semibold">
          Keyboard shortcuts
        </h2>
        <dl className="mt-3 space-y-2 text-sm">
          {shortcuts.map((shortcut) => (
            <div key={shortcut.keys} className="flex items-center gap-3">
              <dt>
                <kbd className="rounded border border-neutral-300 bg-neutral-50 px-1.5 py-0.5 font-mono text-xs">
                  {shortcut.keys}
                </kbd>
              </dt>
              <dd className="text-neutral-700">{shortcut.action}</dd>
            </div>
          ))}
        </dl>
        <button
          ref={closeRef}
          type="button"
          onClick={close}
          className={`mt-4 ${SECONDARY_BUTTON_CLASS}`}
        >
          Close
        </button>
      </div>
    </div>
  );
}
