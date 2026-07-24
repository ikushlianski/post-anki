import { useEffect, useState } from 'react'
import { useNavigate, useRouter } from '@tanstack/react-router'

import type { CurriculumOrigin } from './model'
import {
  confirmCurriculum,
  reparseCurriculum,
  retryDraftStructure,
  retryResearch,
} from './curriculum.api'
import { needsPreAssessment } from './pre-assessment'

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

export function FailedBanner({
  curriculumId,
  origin,
  hasStructureDraftAttempt,
}: {
  curriculumId: string
  origin: CurriculumOrigin
  hasStructureDraftAttempt: boolean
}) {
  const router = useRouter()
  const [busy, setBusy] = useState(false)

  async function retry() {
    setBusy(true)

    if (origin === 'research') {
      await retryResearch({ data: curriculumId })
    } else {
      await reparseCurriculum({ data: curriculumId })
    }

    setBusy(false)
    await router.invalidate()
  }

  async function retryDraft() {
    setBusy(true)
    await retryDraftStructure({ data: curriculumId })
    setBusy(false)
    await router.invalidate()
  }

  // A Phase 5 draft-generation failure (`generateDraftStructure`) — a real,
  // separate failure point from the legacy research/parse paths below, and
  // one those legacy retry actions were never built to recover from (they'd
  // needlessly throw away already-approved sources or pasted material).
  // Takes priority over the origin-based branches: a pasted-material
  // curriculum resolves to origin "sources" but still fails via
  // `generateDraftStructure`, not `reparseCurriculum`.
  if (hasStructureDraftAttempt) {
    return (
      <div className="rounded-lg border border-amber-300 bg-amber-50 p-6 text-center">
        <p className="text-sm font-medium text-amber-800">
          The mentor couldn’t draft a structure for this course.
        </p>
        <p className="mx-auto mt-1 max-w-md text-sm text-amber-700">
          The web search or the drafting step may have failed.
        </p>
        <button
          type="button"
          onClick={retryDraft}
          disabled={busy}
          data-testid="retry-structure-draft"
          className="mt-4 rounded-md bg-neutral-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
        >
          {busy ? 'Retrying…' : 'Retry drafting'}
        </button>
      </div>
    )
  }

  if (origin === 'research') {
    return (
      <div className="rounded-lg border border-amber-300 bg-amber-50 p-6 text-center">
        <p className="text-sm font-medium text-amber-800">
          The mentor couldn’t research this technology.
        </p>
        <p className="mx-auto mt-1 max-w-md text-sm text-amber-700">
          The web search may have failed or turned up nothing usable. Retry to
          run the research again.
        </p>
        <button
          type="button"
          onClick={retry}
          disabled={busy}
          className="mt-4 rounded-md bg-neutral-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
        >
          {busy ? 'Retrying…' : 'Retry research'}
        </button>
      </div>
    )
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
        onClick={retry}
        disabled={busy}
        className="mt-4 rounded-md bg-neutral-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
      >
        {busy ? 'Re-parsing…' : 'Re-parse sources'}
      </button>
    </div>
  )
}

export function ConfirmBar({
  curriculumId,
  studyable,
}: {
  curriculumId: string
  studyable: boolean
}) {
  const router = useRouter()
  const navigate = useNavigate()
  const [busy, setBusy] = useState(false)

  async function confirm() {
    setBusy(true)
    const confirmed = await confirmCurriculum({ data: curriculumId })
    setBusy(false)

    if (needsPreAssessment(confirmed)) {
      // Confirming is the moment status flips to "confirmed" — send the
      // learner straight to the one-time pre-assessment screen instead of
      // relying on router.invalidate() to re-run the loader here, since a
      // same-route invalidate does not turn a loader's thrown redirect()
      // into an actual client-side navigation (verified directly: the
      // confirm call succeeds and the DB updates, but the URL never moves).
      await navigate({
        to: '/curriculum/$curriculumId/assess',
        params: { curriculumId },
      })
      return
    }

    await router.invalidate()
  }

  return (
    <div className="mb-6 flex flex-col items-start gap-3 rounded-lg border border-neutral-900 bg-neutral-900 px-4 py-3 text-sm text-white sm:flex-row sm:items-center sm:justify-between">
      <div>
        <p className="font-medium">Curate, then confirm to start probing.</p>
        <p className="text-neutral-400">
          {studyable
            ? 'Include the topics you care about and set each one’s depth. Probing unlocks once you confirm.'
            : 'Include at least one topic before you can confirm.'}
        </p>
      </div>
      <button
        type="button"
        onClick={confirm}
        disabled={busy || !studyable}
        className="shrink-0 rounded-md bg-white px-4 py-2 font-medium text-neutral-900 disabled:opacity-50"
      >
        {busy ? 'Confirming…' : 'Confirm curriculum'}
      </button>
    </div>
  )
}
