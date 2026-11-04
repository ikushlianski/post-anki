import { createFileRoute, useRouter } from '@tanstack/react-router'

import { loadSourcesBySubject } from '../sources-by-subject/sources-by-subject.api'
import { SourcesBySubjectView } from '../sources-by-subject/sources-by-subject-view'
import { groupSourcesBySubject } from '../sources-by-subject/subject-source-group'
import { pageHead } from '../shared/page-title'

export const Route = createFileRoute('/sources')({
  head: pageHead('Sources'),
  component: SourcesPage,
  loader: () => loadSourcesBySubject(),
})

function SourcesPage() {
  const data = Route.useLoaderData()
  const router = useRouter()

  return (
    <main className="mx-auto max-w-3xl px-5 py-8 sm:px-8 sm:py-10">
      <header className="mb-6">
        <h1 className="text-2xl font-semibold tracking-tight">Sources</h1>
        <p className="mt-1 text-sm text-neutral-500">Where your knowledge comes from, grouped by subject.</p>
      </header>

      <SourcesBySubjectView
        groups={groupSourcesBySubject(data.notionSources, data.librarySources, data.subjects)}
        notionFailed={data.notionFailed}
        libraryFailed={data.libraryFailed}
        subjectsFailed={data.subjectsFailed}
        onRetry={() => void router.invalidate()}
      />
    </main>
  )
}
