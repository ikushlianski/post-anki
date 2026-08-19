import { createFileRoute } from '@tanstack/react-router'

import { getTree } from '../curriculum/curriculum.api'
import { getStreak } from '../curriculum/stats.api'
import { DashboardTree } from '../dashboard/dashboard-tree'

export const Route = createFileRoute('/dashboard')({
  component: DashboardPage,
  loader: async () => {
    const [tree, streak] = await Promise.all([getTree(), getStreak()])

    return { tree, streak }
  },
})

function DashboardPage() {
  const { tree, streak } = Route.useLoaderData()

  return (
    <main className="mx-auto max-w-5xl px-5 py-8 sm:px-8 sm:py-10">
      <header className="mb-6">
        <h1 className="text-2xl font-semibold tracking-tight">Dashboard</h1>
        <p className="mt-1 text-sm text-neutral-500">
          Everything you're learning and where each piece stands. Change any
          status to re-steer — drop a topic to Skipping, push one to Going
          deeper, or mark it Done.
        </p>
      </header>

      <DashboardTree tree={tree} streak={streak} />
    </main>
  )
}
