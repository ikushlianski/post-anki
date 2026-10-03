import { Link, createFileRoute } from '@tanstack/react-router'
import { useSuspenseQuery } from '@tanstack/react-query'

import { curriculumDetailQuery } from '../curriculum/curriculum.queries'
import { MockExamSession } from '../exam/mock-exam-session'

export const Route = createFileRoute('/curriculum/$curriculumId_/exam')({
  component: MockExamPage,
  loader: ({ params, context }) =>
    context.queryClient.ensureQueryData(curriculumDetailQuery(params.curriculumId)),
})

function MockExamPage() {
  const { curriculumId } = Route.useParams()
  const { data: detail } = useSuspenseQuery(curriculumDetailQuery(curriculumId))

  if (!detail) {
    return (
      <main className="mx-auto max-w-3xl px-5 py-8 sm:px-8 sm:py-10">
        <p className="text-sm text-neutral-500">Curriculum not found.</p>
        <Link to="/" className="text-sm underline">
          Back to curricula
        </Link>
      </main>
    )
  }

  return (
    <main className="mx-auto max-w-3xl px-5 py-8 sm:px-8 sm:py-10">
      <header className="mb-6">
        <h1 className="text-2xl font-semibold tracking-tight">
          Mock exam — {detail.curriculum.name}
        </h1>
        <p className="mt-1 text-sm text-neutral-500">
          A timed, fixed-length quiz with a final score — separate from your
          ongoing practice quiz.
        </p>
      </header>

      <MockExamSession curriculumId={curriculumId} />
    </main>
  )
}
