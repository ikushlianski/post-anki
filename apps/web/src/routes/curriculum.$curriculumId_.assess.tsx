import { useEffect, useState } from 'react'
import { Link, createFileRoute, redirect, useNavigate } from '@tanstack/react-router'
import { useSuspenseQuery, useQuery, useQueryClient } from '@tanstack/react-query'
import type { ProbeSession } from '@post-anki/shared'

import type { SelfGrade as SelfGradeValue } from '../curriculum/model'
import { completePreAssessment, setTopicState } from '../curriculum/curriculum.api'
import { curriculumDetailQuery } from '../curriculum/curriculum.queries'
import { getActiveProbeSession } from '../curriculum/probe-session.api'
import { SelfGrade } from '../curriculum/self-grade'
import { ProbeSessionQuiz, probeSessionQueryKey } from '../curriculum/probe-session-quiz'
import { summarizeProbeSessionByTopic } from '../curriculum/probe-topic-summary'

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
  const [levelCheckStarted, setLevelCheckStarted] = useState(false)
  const [completedSession, setCompletedSession] = useState<ProbeSession | null>(null)

  const probeQueryKey = probeSessionQueryKey('curriculum', curriculumId)
  const { data: liveSession } = useQuery({
    queryKey: probeQueryKey,
    queryFn: () =>
      getActiveProbeSession({ data: { scope: 'curriculum', scopeId: curriculumId } }),
    enabled: levelCheckStarted,
  })

  useEffect(() => {
    if (liveSession && liveSession.status === 'completed' && completedSession === null) {
      setCompletedSession(liveSession)
    }
  }, [liveSession, completedSession])

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
  const topicTitleById = new Map(includedTopics.map(({ topic }) => [topic.id, topic.title]))

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
          Take a quick level check, self-grade any topic in {detail.curriculum.name}{' '}
          you already have a sense of, or both. This is entirely optional —
          do none, some, or all of it, then start studying whenever you're
          ready.
        </p>
      </header>

      {includedTopics.length === 0 ? (
        <p className="mb-6 rounded-lg border border-dashed border-neutral-300 bg-white p-6 text-center text-sm text-neutral-500">
          No topics are included yet — you can start studying and shape the
          curriculum as you go.
        </p>
      ) : (
        <>
          <section className="mb-6 rounded-lg border border-neutral-200 bg-white p-4">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-sm font-medium text-neutral-900">
                  Quick level check
                </p>
                <p className="mt-0.5 text-xs text-neutral-500">
                  A short auto-generated quiz spanning every included topic —
                  gives a rough strong/weak picture per topic in a couple of
                  minutes.
                </p>
              </div>
              {!levelCheckStarted ? (
                <button
                  type="button"
                  data-testid="start-level-check"
                  onClick={() => setLevelCheckStarted(true)}
                  className="shrink-0 rounded-md bg-neutral-900 px-3 py-1.5 text-sm font-medium text-white"
                >
                  Take a quick level check
                </button>
              ) : null}
            </div>

            {levelCheckStarted ? (
              <ProbeSessionQuiz
                scope="curriculum"
                scopeId={curriculumId}
                hasCitableSources={detail.hasCitableSources}
              />
            ) : null}

            {completedSession ? (
              <LevelCheckSummary
                session={completedSession}
                topicTitleById={topicTitleById}
              />
            ) : null}
          </section>

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
        </>
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

function LevelCheckSummary({
  session,
  topicTitleById,
}: {
  session: ProbeSession
  topicTitleById: Map<string, string>
}) {
  const rows = summarizeProbeSessionByTopic(session, topicTitleById)

  return (
    <div className="mt-4 border-t border-neutral-200 pt-4" data-testid="level-check-summary">
      <p className="mb-2 text-xs font-medium uppercase tracking-wide text-neutral-400">
        Per-topic results — {session.correct}/{session.total} correct overall
      </p>
      {rows.length === 0 ? (
        <p className="text-sm text-neutral-400">No topic breakdown available.</p>
      ) : (
        <ul className="space-y-1.5">
          {rows.map((row) => (
            <li
              key={row.topicId}
              data-testid="level-check-topic-row"
              className="flex items-center justify-between gap-2 text-sm"
            >
              <span className="text-neutral-800">{row.topicTitle}</span>
              <span
                className={
                  row.strength === 'strong'
                    ? 'rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-medium text-emerald-800'
                    : row.strength === 'weak'
                      ? 'rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-800'
                      : 'rounded-full bg-neutral-100 px-2 py-0.5 text-xs font-medium text-neutral-600'
                }
              >
                {row.correct}/{row.total}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
