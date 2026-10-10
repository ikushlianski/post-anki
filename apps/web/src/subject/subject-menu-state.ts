import { useRef, useState } from 'react'

import type { OverflowMenuHandle } from '../ui/overflow-menu'

export type SubjectMenuView =
  | 'closed'
  | 'actions'
  | 'rename'
  | 'add-child'
  | 'move'
  | 'confirm-delete'

export function useSubjectMenuState() {
  const [view, setView] = useState<SubjectMenuView>('closed')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const menuRef = useRef<OverflowMenuHandle>(null)

  function showView(next: SubjectMenuView) {
    setError(null)
    setView(next)
  }

  function handleOpenChange(next: boolean) {
    if (next) {
      showView('actions')

      return
    }

    setView('closed')
    setError(null)
  }

  function close(restoreFocus: boolean) {
    handleOpenChange(false)

    if (restoreFocus) {
      menuRef.current?.focusTrigger()
    }
  }

  async function attempt(action: () => Promise<boolean>, failureMessage: string): Promise<boolean> {
    setBusy(true)
    setError(null)

    const ok = await action()

    setBusy(false)

    if (!ok) {
      setError(failureMessage)
      menuRef.current?.focusFirstControl()
    }

    return ok
  }

  return {
    menuRef,
    view,
    isOpen: view !== 'closed',
    busy,
    error,
    showView,
    handleOpenChange,
    close,
    attempt,
  }
}
