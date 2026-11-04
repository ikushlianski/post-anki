import { useState } from 'react'
import { useRouter } from '@tanstack/react-router'

export const ACTION_FAILED_MESSAGE = "Couldn't do that, try again"

export function useGuardedRun() {
  const router = useRouter()
  const [busy, setBusy] = useState(false)
  const [failed, setFailed] = useState(false)

  async function run(fn: () => Promise<unknown>): Promise<boolean> {
    setBusy(true)
    setFailed(false)

    try {
      await fn()
      await router.invalidate()

      return true
    } catch {
      setFailed(true)

      return false
    } finally {
      setBusy(false)
    }
  }

  return { busy, failed, run }
}
