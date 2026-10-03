import { Link, createFileRoute } from '@tanstack/react-router'
import { useSuspenseQuery } from '@tanstack/react-query'
import { probeScopeSchema, type ProbeScope } from '@post-anki/shared'

import { curriculumDetailQuery } from '../curriculum/curriculum.queries'
import { buildExamScopeOptions } from '../exam/exam-scope-options'
import { MockExamSession } from '../exam/mock-exam-session'

interface ExamSearch {
  scope?: ProbeScope
  scopeId?: string
}

export const Route = createFileRoute('/curriculum/$curriculumId_/exam')({
  component: MockExamPage,
  validateSearch: (search: Record<string, unknown>): ExamSearch => {
    const scopeResult = probeScopeSchema.safeParse(search.scope)

    return {
      scope: scopeResult.success ? scopeResult.data : undefined,
      scopeId: typeof search.scopeId === 'string' ? search.scopeId : undefined,
    }
  },
  loader: ({ params, context }) =>
    context.queryClient.ensureQueryData(curriculumDetailQuery(params.curriculumId)),
})

function MockExamPage() {
  const { curriculumId } = Route.useParams()
  const search = Route.useSearch()
  const navigate = Route.useNavigate()
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

  const scopeOptions = buildExamScopeOptions(curriculumId, detail.modules)
  // A stale/unrecognized scopeId falls back to curriculum scope.
  const matchedOption = scopeOptions.find(
    (option) => option.scope === search.scope && option.scopeId === search.scopeId,
  )
  const scope: ProbeScope = matchedOption?.scope ?? 'curriculum'
  const scopeId = matchedOption?.scopeId ?? curriculumId

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

      <MockExamSession
        key={`${scope}:${scopeId}`}
        scope={scope}
        scopeId={scopeId}
        scopeOptions={scopeOptions}
        onScopeChange={(nextScope, nextScopeId) =>
          navigate({
            search:
              nextScope === 'curriculum'
                ? {}
                : { scope: nextScope, scopeId: nextScopeId },
            replace: true,
          })
        }
      />
    </main>
  )
}
