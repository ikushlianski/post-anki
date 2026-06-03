import { useEffect, useState } from 'react'
import { useRouter } from '@tanstack/react-router'

import { confirmCurriculum, reparseCurriculum } from './curriculum.api'

export function CuratingBanner() {
  const router = useRouter()

  useEffect(() => {
    const timer = setInterval(() => {
      void router.invalidate()
    }, 2500)

    return () => clearInterval(timer)
  }, [router])

  return (
    <div className="rounded-lg border border-neutral-300 bg-white p-6 text-center">
      <p className="text-sm font-medium text-neutral-700">
        The mentor is reading your sources…
      </p>
      <p className="mx-auto mt-1 max-w-md text-sm text-neutral-500">
        Breaking the material into modules, topics, and knowledge gaps. This
        refreshes on its own — no need to reload.
      </p>
    </div>
  )
}

export function FailedBanner({ curriculumId }: { curriculumId: string }) {
  const router = useRouter()
  const [busy, setBusy] = useState(false)

  async function reparse() {
    setBusy(true)
    await reparseCurriculum({ data: curriculumId })
    setBusy(false)
    await router.invalidate()
  }

  return (
    <div className="rounded-lg border border-amber-300 bg-amber-50 p-6 text-center">
      <p className="text-sm font-medium text-amber-800">
        The mentor couldn’t parse these sources.
      </p>
      <p className="mx-auto mt-1 max-w-md text-sm text-amber-700">
        A source may have been unreachable or empty. Re-parse to try again, or
        add different sources above.
      </p>
      <button
        type="button"
        onClick={reparse}
        disabled={busy}
        className="mt-4 rounded-md bg-neutral-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
      >
        {busy ? 'Re-parsing…' : 'Re-parse sources'}
      </button>
    </div>
  )
}

export function ConfirmBar({ curriculumId }: { curriculumId: string }) {
  const router = useRouter()
  const [busy, setBusy] = useState(false)

  async function confirm() {
    setBusy(true)
    await confirmCurriculum({ data: curriculumId })
    setBusy(false)
    await router.invalidate()
  }

  return (
    <div className="mb-6 flex flex-col items-start gap-3 rounded-lg border border-neutral-900 bg-neutral-900 px-4 py-3 text-sm text-white sm:flex-row sm:items-center sm:justify-between">
      <div>
        <p className="font-medium">Curate, then confirm to start probing.</p>
        <p className="text-neutral-400">
          Include the topics you care about and set each one’s depth. Probing
          unlocks once you confirm.
        </p>
      </div>
      <button
        type="button"
        onClick={confirm}
        disabled={busy}
        className="shrink-0 rounded-md bg-white px-4 py-2 font-medium text-neutral-900 disabled:opacity-50"
      >
        {busy ? 'Confirming…' : 'Confirm curriculum'}
      </button>
    </div>
  )
}
