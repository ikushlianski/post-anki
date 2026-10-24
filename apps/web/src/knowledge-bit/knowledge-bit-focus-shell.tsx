import type { ReactNode } from 'react'

import { SECONDARY_BUTTON_CLASS } from './knowledge-bit-review-classes'
import { useKeyboardOffset, useMobileScrollLock } from './use-keyboard-offset'

export function KnowledgeBitFocusShell({
  children,
  readyCount,
  waitingCount,
  canUndo,
  isBusy = false,
  onUndo,
  onFinish,
}: {
  children: ReactNode
  readyCount: number
  waitingCount: number
  canUndo: boolean
  isBusy?: boolean
  onUndo: () => void
  onFinish: () => void
}) {
  const keyboardOffset = useKeyboardOffset(true)

  useMobileScrollLock(true)

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Review suggested cards"
      data-testid="knowledge-bit-focus-shell"
      style={{ paddingBottom: keyboardOffset }}
      className="fixed inset-0 z-50 flex h-dvh flex-col bg-neutral-50"
    >
      <header className="flex items-center justify-between gap-2 border-b border-neutral-200 bg-white px-4 pb-2 pt-[max(0.5rem,env(safe-area-inset-top))]">
        <p
          data-testid="knowledge-bit-focus-progress"
          className="min-w-0 text-sm text-neutral-700"
        >
          <span>{readyCount} to review</span>
          {waitingCount > 0 ? (
            <span
              data-testid="knowledge-bit-focus-waiting"
              className="ml-2 text-neutral-500"
            >
              Writing cards… {waitingCount} waiting
            </span>
          ) : null}
        </p>
        <div className="flex shrink-0 gap-2">
          <button
            type="button"
            data-testid="knowledge-bit-focus-undo"
            disabled={!canUndo || isBusy}
            onClick={onUndo}
            className={SECONDARY_BUTTON_CLASS}
          >
            Undo
            <kbd className="hidden text-neutral-500 sm:inline">z</kbd>
          </button>
          <button
            type="button"
            data-testid="knowledge-bit-focus-finish"
            onClick={onFinish}
            className={SECONDARY_BUTTON_CLASS}
          >
            Finish
            <kbd className="hidden text-neutral-500 sm:inline">f</kbd>
          </button>
        </div>
      </header>
      <div className="min-h-0 flex-1 overflow-y-auto">{children}</div>
    </div>
  )
}
