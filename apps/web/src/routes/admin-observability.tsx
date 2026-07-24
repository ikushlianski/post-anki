import { createFileRoute } from '@tanstack/react-router'

import { getAdminObservability } from '../admin-observability/admin-observability.api'

export const Route = createFileRoute('/admin-observability')({
  component: AdminObservabilityPage,
  loader: () => getAdminObservability(),
})

function formatStuckFor(ms: number): string {
  const minutes = Math.round(ms / 60_000)

  if (minutes < 60) {
    return `${minutes}m`
  }

  const hours = Math.floor(minutes / 60)
  const remainingMinutes = minutes % 60

  return `${hours}h ${remainingMinutes}m`
}

function formatDurationMs(ms: number): string {
  if (ms < 1000) {
    return `${ms}ms`
  }

  return `${(ms / 1000).toFixed(1)}s`
}

function AdminObservabilityPage() {
  const data = Route.useLoaderData()

  return (
    <main className="mx-auto max-w-5xl px-5 py-8 sm:px-8 sm:py-10">
      <header className="mb-6">
        <h1 className="text-2xl font-semibold tracking-tight">Observability</h1>
        <p className="mt-1 text-sm text-neutral-500">
          Stuck-course detection and recent LLM call events. Internal debugging view.
        </p>
      </header>

      <section className="mb-10">
        <h2 className="mb-3 text-lg font-medium">Stuck curricula</h2>
        {data.stuckCurricula.length === 0 ? (
          <p className="text-sm text-neutral-500">None right now.</p>
        ) : (
          <div className="overflow-x-auto rounded-lg border border-neutral-200">
            <table className="w-full text-left text-sm">
              <thead className="bg-neutral-50 text-xs uppercase text-neutral-500">
                <tr>
                  <th className="px-4 py-2">Name</th>
                  <th className="px-4 py-2">Status</th>
                  <th className="px-4 py-2">Stuck for</th>
                </tr>
              </thead>
              <tbody>
                {data.stuckCurricula.map((c) => (
                  <tr key={c.id} className="border-t border-neutral-200">
                    <td className="px-4 py-2">{c.name}</td>
                    <td className="px-4 py-2">{c.status}</td>
                    <td className="px-4 py-2">{formatStuckFor(c.stuckForMs)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section>
        <h2 className="mb-3 text-lg font-medium">Recent LLM call events</h2>
        {data.recentEvents.length === 0 ? (
          <p className="text-sm text-neutral-500">No events recorded yet.</p>
        ) : (
          <div className="overflow-x-auto rounded-lg border border-neutral-200">
            <table className="w-full text-left text-sm">
              <thead className="bg-neutral-50 text-xs uppercase text-neutral-500">
                <tr>
                  <th className="px-4 py-2">Op</th>
                  <th className="px-4 py-2">Agent</th>
                  <th className="px-4 py-2">Curriculum</th>
                  <th className="px-4 py-2">Result</th>
                  <th className="px-4 py-2">Duration</th>
                  <th className="px-4 py-2">When</th>
                </tr>
              </thead>
              <tbody>
                {data.recentEvents.map((e) => (
                  <tr key={e.id} className="border-t border-neutral-200">
                    <td className="px-4 py-2">{e.op}</td>
                    <td className="px-4 py-2">{e.agentKey}</td>
                    <td className="px-4 py-2">{e.curriculumName ?? e.curriculumId ?? '—'}</td>
                    <td className="px-4 py-2">
                      {e.success ? (
                        <span className="text-emerald-600">ok</span>
                      ) : (
                        <span className="text-red-600" title={e.errorMessage ?? undefined}>
                          failed
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-2">{formatDurationMs(e.durationMs)}</td>
                    <td className="px-4 py-2 text-neutral-500">
                      {new Date(e.createdAt).toLocaleString()}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </main>
  )
}
