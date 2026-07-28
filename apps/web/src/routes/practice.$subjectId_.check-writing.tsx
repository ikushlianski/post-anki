import { ClientOnly, Link, createFileRoute, notFound } from '@tanstack/react-router'

import { getBoard } from '../curriculum/curriculum.api'
import { CheckWriting } from '../practice/check-writing'

export const Route = createFileRoute('/practice/$subjectId_/check-writing')({
  component: CheckWritingPage,
  loader: async ({ params }) => {
    const { subjects } = await getBoard()
    const subject = subjects.find((candidate) => candidate.id === params.subjectId)

    if (!subject || subject.kind !== 'language-practice') {
      throw notFound()
    }

    return { subject }
  },
})

function CheckWritingPage() {
  const { subject } = Route.useLoaderData()

  return (
    <main className="mx-auto max-w-2xl px-5 py-8 sm:px-8 sm:py-10">
      <Link
        to="/practice/$subjectId"
        params={{ subjectId: subject.id }}
        className="text-sm text-neutral-500 hover:text-neutral-900"
      >
        ← {subject.name}
      </Link>

      <header className="mb-6 mt-3">
        <h1 className="text-2xl font-semibold tracking-tight">Check my writing</h1>
        <p className="mt-1 text-sm text-neutral-500">
          Paste anything you wrote — a Slack message, a PR description, an email — and get a
          native-soundingness check.
        </p>
      </header>

      <ClientOnly fallback={<p className="text-neutral-500">Loading…</p>}>
        <CheckWriting subjectId={subject.id} />
      </ClientOnly>
    </main>
  )
}
