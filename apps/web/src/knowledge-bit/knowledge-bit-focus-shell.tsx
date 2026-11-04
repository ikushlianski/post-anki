import { useState, type ReactNode } from 'react'

import { ShortcutsHelp } from '../shortcuts-help/shortcuts-help'
import { FOCUS_SHORTCUTS } from './knowledge-bit-focus-shortcuts'
import { SECONDARY_BUTTON_CLASS } from './knowledge-bit-review-classes'
import { useKeyboardOffset, useMobileScrollLock } from './use-keyboard-offset'

export function KnowledgeBitFocusShell({
  children,
  readyCount,
  waitingCount,
  decidedCount = 0,
  pendingCount = 0,
  canUndo,
  isBusy = false,
  onUndo,
  onFinish,
}: {
  children: ReactNode
  readyCount: number
  waitingCount: number
  decidedCount?: number
  pendingCount?: number
  canUndo: boolean
  isBusy?: boolean
  onUndo: () => void
  onFinish: () => void
}) {
  const [helpOpen, setHelpOpen] = useState(false)
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
          {readyCount > 0 ? (
            <span data-testid="knowledge-bit-focus-position" className="mr-2 font-medium text-neutral-900">
              {decidedCount + 1} of {decidedCount + Math.max(readyCount + waitingCount, pendingCount)}
            </span>
          ) : null}
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
            Leave
          </button>
          <button
            type="button"
            data-testid="knowledge-bit-focus-help"
            aria-label="Keyboard shortcuts"
            title="Keyboard shortcuts (?)"
            onClick={() => setHelpOpen(true)}
            className={`${SECONDARY_BUTTON_CLASS} sm:min-w-8`}
          >
            ?
          </button>
        </div>
      </header>
      <div className="min-h-0 flex-1 overflow-y-auto">{children}</div>
      <ShortcutsHelp
        open={helpOpen}
        onOpenChange={setHelpOpen}
        shortcuts={FOCUS_SHORTCUTS}
        testId="knowledge-bit-focus-shortcuts-dialog"
      />
    </div>
  )
}
