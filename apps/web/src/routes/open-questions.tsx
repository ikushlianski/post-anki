import { ClientOnly, createFileRoute } from '@tanstack/react-router'

import { OpenQuestionsList } from '../open-questions/open-questions-list'

// open-questions-review (issue #87) — its own dedicated route rather than
// folded into /today or /dashboard, same reasoning as
// subject.$subjectId.priority-review.tsx: /today is the passive nudge
// surface (capped at 3, silent-on-non-response); the full list — including
// answered/dismissed history and the actual answer-writing interaction —
// needs its own page. Client-only rendering + useQuery (not a loader),
// mirroring /decide's shape, since mutating rows in place and reflecting
// their new status without a full reload is the same requirement decide's
// blind-spot resolution already solved.
export const Route = createFileRoute('/open-questions')({
  component: OpenQuestionsPage,
})

function OpenQuestionsPage() {
  return (
    <main className="mx-auto max-w-3xl px-5 py-8 sm:px-8 sm:py-10">
      <header className="mb-8">
        <h1 className="text-2xl font-semibold tracking-tight">Open questions</h1>
        <p className="mt-1 text-sm text-neutral-500">
          Questions you captured mid-study, waiting for you to answer or set aside.
        </p>
      </header>

      <ClientOnly fallback={<p className="text-neutral-500">Loading…</p>}>
        <OpenQuestionsList />
      </ClientOnly>
    </main>
  )
}
