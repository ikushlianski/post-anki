import { createFileRoute } from '@tanstack/react-router'

import { browserTimeZone } from '../shared/browser-time-zone'
import { getAiSpend, getLearningStats } from '../stats/stats.api'
import { StatsPage } from '../stats/stats-page'
import { pageHead } from '../shared/page-title'

const DEFAULT_DAYS = 30

export const Route = createFileRoute('/stats')({
  head: pageHead('Stats'),
  component: StatsRoute,
  loader: async () => {
    const query = { tz: browserTimeZone(), days: DEFAULT_DAYS }
    const [learning, spend] = await Promise.all([getLearningStats({ data: query }), getAiSpend({ data: query })])

    return { learning, spend }
  },
})

function StatsRoute() {
  const initial = Route.useLoaderData()

  return (
    <main className="mx-auto max-w-4xl px-5 py-8 sm:px-8 sm:py-10">
      <header className="mb-8">
        <h1 className="text-2xl font-semibold tracking-tight">Stats</h1>
        <p className="mt-1 text-sm text-neutral-500">Learning activity and estimated AI spend.</p>
      </header>

      <StatsPage initial={initial} initialDays={DEFAULT_DAYS} />
    </main>
  )
}
