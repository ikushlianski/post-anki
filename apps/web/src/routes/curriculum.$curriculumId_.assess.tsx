import { useState } from 'react'
import { Link, createFileRoute, redirect, useNavigate } from '@tanstack/react-router'
import { useSuspenseQuery, useQueryClient } from '@tanstack/react-query'

import type { SelfGrade as SelfGradeValue } from '../curriculum/model'
import { completePreAssessment, setTopicState } from '../curriculum/curriculum.api'
import { curriculumDetailQuery } from '../curriculum/curriculum.queries'
import { SelfGrade } from '../curriculum/self-grade'

export const Route = createFileRoute('/curriculum/$curriculumId_/assess')({
  component: PreAssessmentPage,
  loader: async ({ params, context }) => {
    const detail = await context.queryClient.ensureQueryData(
      curriculumDetailQuery(params.curriculumId),
    )

    if (detail?.curriculum.preAssessmentCompletedAt) {
      throw redirect({
        to: '/curriculum/$curriculumId',
        params: { curriculumId: params.curriculumId },
      })
    }

    return detail
  },
})

function PreAssessmentPage() {
  const { curriculumId } = Route.useParams()
  const { data: detail } = useSuspenseQuery(curriculumDetailQuery(curriculumId))
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const [busy, setBusy] = useState(false)
  const [grades, setGrades] = useState<Record<string, SelfGradeValue | null>>({})

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

  const includedTopics = detail.modules.flatMap((module) =>
    module.topics
      .filter((topic) => topic.included)
      .map((topic) => ({ topic, moduleTitle: module.title })),
  )

  async function grade(topicId: string, value: SelfGradeValue | null) {
    setGrades((prev) => ({ ...prev, [topicId]: value }))
    await setTopicState({ data: { topicId, selfGrade: value } })
  }

  async function startStudying() {
    setBusy(true)
    await completePreAssessment({ data: curriculumId })
    await queryClient.invalidateQueries({
      queryKey: curriculumDetailQuery(curriculumId).queryKey,
    })
    setBusy(false)
    await navigate({ to: '/curriculum/$curriculumId', params: { curriculumId } })
  }

  return (
    <main className="mx-auto max-w-3xl px-5 py-8 sm:px-8 sm:py-10">
      <header className="mb-6">
        <h1 className="text-2xl font-semibold tracking-tight">
          What do you already know?
        </h1>
        <p className="mt-1 text-sm text-neutral-500">
          Self-grade any topic in {detail.curriculum.name} you already have a
          sense of. This is entirely optional — grade none, some, or all of
          them, then start studying whenever you're ready.
        </p>
      </header>

      {includedTopics.length === 0 ? (
        <p className="mb-6 rounded-lg border border-dashed border-neutral-300 bg-white p-6 text-center text-sm text-neutral-500">
          No topics are included yet — you can start studying and shape the
          curriculum as you go.
        </p>
      ) : (
        <ul className="mb-6 space-y-3">
          {includedTopics.map(({ topic, moduleTitle }) => (
            <li
              key={topic.id}
              data-testid="pre-assessment-topic-row"
              className="flex flex-col gap-2 rounded-lg border border-neutral-200 bg-white px-4 py-3 sm:flex-row sm:items-center sm:justify-between"
            >
              <div>
                <p className="text-sm font-medium text-neutral-900">
                  {topic.title}
                </p>
                <p className="text-xs text-neutral-400">{moduleTitle}</p>
              </div>
              <SelfGrade
                value={grades[topic.id] ?? topic.selfGrade}
                onChange={(value) => grade(topic.id, value)}
                disabled={busy}
              />
            </li>
          ))}
        </ul>
      )}

      <button
        type="button"
        data-testid="start-studying-button"
        onClick={startStudying}
        disabled={busy}
        className="rounded-md bg-neutral-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
      >
        {busy ? 'Starting…' : 'Start studying'}
      </button>
    </main>
  )
}
