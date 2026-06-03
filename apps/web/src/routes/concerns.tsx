import { createFileRoute } from '@tanstack/react-router'

import { getCrossCutting } from '../curriculum/curriculum.api'
import { ProgressBar } from '../curriculum/progress-bar'
import { CONCERN_LABEL } from '../curriculum/concern-labels'

export const Route = createFileRoute('/concerns')({
  component: ConcernsPage,
  loader: () => getCrossCutting(),
})

function ConcernsPage() {
  const summaries = Route.useLoaderData()

  return (
    <main className="mx-auto max-w-3xl px-5 py-8 sm:px-8 sm:py-10">
      <header className="mb-8">
        <h1 className="text-2xl font-semibold tracking-tight">
          Cross-cutting concerns
        </h1>
        <p className="mt-1 text-sm text-neutral-500">
          The same themes — security, performance, cost — recur across topics.
          Here’s how well covered each one is across everything you’ve
          confirmed.
        </p>
      </header>

      {summaries.length === 0 ? (
        <div className="rounded-lg border border-dashed border-neutral-300 bg-white p-6 text-center text-sm text-neutral-500">
          No tagged gaps yet. Confirm a curriculum and the mentor’s gaps will
          roll up here by concern.
        </div>
      ) : (
        <div className="space-y-4">
          {summaries.map((summary) => {
            const percent =
              summary.total === 0
                ? 0
                : Math.round((summary.covered / summary.total) * 100)

            return (
              <div
                key={summary.concern}
                className="rounded-xl border border-neutral-200 bg-white p-5"
              >
                <div className="mb-2 flex items-baseline justify-between gap-4">
                  <h3 className="text-base font-semibold tracking-tight">
                    {CONCERN_LABEL[summary.concern]}
                  </h3>
                  <span className="text-xs text-neutral-400">
                    {summary.covered}/{summary.total} covered · {summary.open}{' '}
                    open
                  </span>
                </div>
                <ProgressBar percent={percent} />
              </div>
            )
          })}
        </div>
      )}
    </main>
  )
}
