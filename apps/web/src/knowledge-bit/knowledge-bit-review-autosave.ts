import { useEffect, useRef, useState } from 'react'

export type AutoSaveStatus = 'idle' | 'saving' | 'saved' | 'error'

export const AUTOSAVE_DEBOUNCE_MS = 800

const TICK_MS = 250

function sameFields(a: Record<string, string>, b: Record<string, string>): boolean {
  return Object.keys(a).every((key) => a[key] === b[key])
}

// Fields are read from the DOM on a short tick because dictation tools set a value without firing input events.
export function useAutoSave<T extends Record<string, string>>({
  initial,
  read,
  isValid,
  save,
  onBusyChange,
}: {
  initial: T
  read: () => T
  isValid: (fields: T) => boolean
  save: (fields: T) => Promise<boolean>
  onBusyChange: (busy: boolean) => void
}): AutoSaveStatus {
  const [status, setStatus] = useState<AutoSaveStatus>('idle')
  const lastAttempt = useRef<T>(initial)
  const changedAt = useRef<number | null>(null)
  const inFlight = useRef(false)
  const failed = useRef(false)
  const reportedBusy = useRef(false)
  const latest = useRef({ read, isValid, save, onBusyChange })

  latest.current = { read, isValid, save, onBusyChange }

  useEffect(() => {
    const timer = window.setInterval(() => {
      const { read: readNow, isValid: validNow, save: saveNow, onBusyChange: reportBusy } = latest.current
      const current = readNow()

      if (!sameFields(current, lastAttempt.current)) {
        changedAt.current ??= Date.now()
        failed.current = false
      }

      const dirty = changedAt.current !== null
      const busy = dirty || inFlight.current || failed.current

      if (busy !== reportedBusy.current) {
        reportedBusy.current = busy
        reportBusy(busy)
      }

      if (
        !dirty ||
        inFlight.current ||
        Date.now() - (changedAt.current ?? 0) < AUTOSAVE_DEBOUNCE_MS ||
        !validNow(current)
      ) {
        return
      }

      lastAttempt.current = current
      changedAt.current = null
      inFlight.current = true
      setStatus('saving')
      void saveNow(current).then((saved) => {
        inFlight.current = false
        failed.current = !saved
        setStatus(saved ? 'saved' : 'error')
      })
    }, TICK_MS)

    return () => {
      window.clearInterval(timer)

      if (reportedBusy.current) {
        reportedBusy.current = false
        latest.current.onBusyChange(false)
      }
    }
  }, [])

  return status
}

export const AUTOSAVE_STATUS_TEXT: Record<AutoSaveStatus, string> = {
  idle: '',
  saving: 'Saving…',
  saved: 'Saved',
  error: 'Could not save. Edit again to retry',
}
