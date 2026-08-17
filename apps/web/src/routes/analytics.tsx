import { createFileRoute } from '@tanstack/react-router'

import { AnalyticsDashboard } from '../analytics/analytics-dashboard'
import { getCoverageReport, getRetentionReport, getWeeklyDigest } from '../analytics/analytics.api'

export const Route = createFileRoute('/analytics')({
  component: AnalyticsPage,
  loader: async () => {
    const [digest, coverage, retention] = await Promise.all([
      getWeeklyDigest(),
      getCoverageReport(),
      getRetentionReport(),
    ])

    return { digest, coverage, retention }
  },
})

function AnalyticsPage() {
  const { digest, coverage, retention } = Route.useLoaderData()

  return (
    <main className="mx-auto max-w-4xl px-5 py-8 sm:px-8 sm:py-10">
      <header className="mb-8">
        <h1 className="text-2xl font-semibold tracking-tight">Analytics</h1>
        <p className="mt-1 text-sm text-neutral-500">
          Retention, time-to-mastery, and coverage — computed fresh every time
          you open this page. Nothing here is pushed to you.
        </p>
      </header>

      <AnalyticsDashboard digest={digest} coverage={coverage} retention={retention} />
    </main>
  )
}
