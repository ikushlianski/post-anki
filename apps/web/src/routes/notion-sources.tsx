import { createFileRoute, Link, useRouter } from '@tanstack/react-router'

import { NotionSourcesPanel } from '../notion-source/notion-sources-panel'
import { listNotionSources } from '../notion-source/notion-source.api'
import { pageHead } from '../shared/page-title'

export const Route = createFileRoute('/notion-sources')({
  head: pageHead('Notion sources'),
  component: NotionSourcesPage,
  loader: async () => ({ result: await listNotionSources() }),
})

function NotionSourcesPage() {
  const { result } = Route.useLoaderData()
  const router = useRouter()

  return (
    <main className="mx-auto max-w-3xl px-5 py-8 sm:px-8 sm:py-10">
      <header className="mb-6">
        <h1 className="text-2xl font-semibold tracking-tight">Notion sources</h1>
        <p className="mt-1 text-sm text-neutral-500">
          Notion pages whose items are imported as cards. The Notion token is set in{' '}
          <Link to="/admin-settings" hash="notion-connection" className="font-medium text-neutral-900 underline">
            Admin settings
          </Link>
          .
        </p>
      </header>

      <NotionSourcesPanel
        sources={result.ok ? result.data : []}
        loadFailed={!result.ok}
        onChanged={() => router.invalidate()}
      />
    </main>
  )
}
