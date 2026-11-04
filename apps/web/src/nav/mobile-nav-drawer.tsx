import { useEffect } from 'react'
import { useRouterState } from '@tanstack/react-router'

import { Sidebar } from './sidebar'

export function MobileNavDrawer({ open, onClose }: { open: boolean; onClose: () => void }) {
  const pathname = useRouterState({ select: (state) => state.location.pathname })

  useEffect(() => {
    onClose()
  }, [pathname])

  useEffect(() => {
    if (!open) {
      return
    }

    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        onClose()
      }
    }

    document.addEventListener('keydown', onKeyDown)

    return () => document.removeEventListener('keydown', onKeyDown)
  }, [open, onClose])

  if (!open) {
    return null
  }

  return (
    <>
      <div
        data-testid="mobile-nav-backdrop"
        className="fixed inset-0 z-30 bg-black/30 md:hidden"
        onClick={onClose}
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Navigation"
        data-testid="mobile-nav-drawer"
        className="fixed inset-y-0 left-0 z-40 w-64 bg-white shadow-lg md:hidden flex flex-col"
      >
        <div className="flex justify-end border-b border-neutral-200 p-2">
          <button
            type="button"
            data-testid="mobile-nav-close"
            onClick={onClose}
            className="min-h-[44px] min-w-[44px] rounded-md px-2 py-1 text-sm text-neutral-600 hover:bg-neutral-100"
          >
            Close
          </button>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto">
          <Sidebar />
        </div>
      </div>
    </>
  )
}
