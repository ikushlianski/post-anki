import type { ReactNode } from 'react'

import { useKeyboardOffset, useMobileScrollLock } from './use-keyboard-offset'

interface KnowledgeBitChatSheetProps {
  onClose: () => void
  children: ReactNode
}

export function KnowledgeBitChatSheet({ onClose, children }: KnowledgeBitChatSheetProps) {
  const keyboardOffset = useKeyboardOffset(true)

  useMobileScrollLock(true)

  return (
    <>
      <button
        type="button"
        aria-label="Close chat"
        data-testid="knowledge-bit-chat-backdrop"
        onClick={onClose}
        className="fixed inset-0 z-40 bg-black/40 sm:hidden"
      />
      <div
        data-testid="knowledge-bit-chat-panel"
        role="dialog"
        aria-label="Chat about this"
        style={{ bottom: keyboardOffset }}
        className="fixed inset-x-0 z-50 flex h-[85dvh] max-h-[100dvh] flex-col rounded-t-xl border-t border-neutral-200 bg-white shadow-lg sm:static sm:z-auto sm:h-auto sm:max-h-none sm:w-full sm:max-w-sm sm:rounded-md sm:border sm:shadow-sm"
      >
        {children}
      </div>
    </>
  )
}
