import { createFileRoute, useRouter } from '@tanstack/react-router'

import { getBoard } from '../curriculum/curriculum.api'
import { listLearningPaths } from '../learning-path/learning-path.api'
import { ConsistencyPanel } from '../study-session/consistency-panel'
import { ScheduleForm } from '../study-session/schedule-form'
import { ScheduleList } from '../study-session/schedule-list'
import {
  createStudySession,
  getStudySessionConsistency,
  listStudySessions,
} from '../study-session/study-session.api'

export const Route = createFileRoute('/study-sessions')({
  component: StudySessionsPage,
  loader: async () => {
    const [board, learningPaths, sessions, consistency] = await Promise.all([
      getBoard(),
      listLearningPaths({ data: { onlyActive: true } }),
      listStudySessions(),
      getStudySessionConsistency({ data: undefined }),
    ])

    return { curricula: board.curricula, learningPaths, sessions, consistency }
  },
})

function StudySessionsPage() {
  const { curricula, learningPaths, sessions, consistency } = Route.useLoaderData()
  const router = useRouter()

  const namesById: Record<string, string> = {}

  for (const curriculum of curricula) {
    namesById[curriculum.id] = curriculum.name
  }

  for (const path of learningPaths) {
    namesById[path.id] = path.name
  }

  return (
    <main className="mx-auto max-w-3xl px-5 py-8 sm:px-8 sm:py-10">
      <header className="mb-6">
        <h1 className="text-2xl font-semibold tracking-tight">Study sessions</h1>
        <p className="mt-1 text-sm text-neutral-500">
          Plan a focused session, run it, and see how consistent you've been —
          nothing here ever nags about a session you missed.
        </p>
      </header>

      <section className="mb-6">
        <ConsistencyPanel consistency={consistency} />
      </section>

      <section className="mb-8">
        <ScheduleForm
          curricula={curricula.map((curriculum) => ({ id: curriculum.id, name: curriculum.name }))}
          learningPaths={learningPaths.map((path) => ({ id: path.id, name: path.name }))}
          onSchedule={(data) => createStudySession({ data })}
          onScheduled={(session) =>
            router.navigate({
              to: '/study-sessions/$sessionId',
              params: { sessionId: session.id },
            })
          }
        />
      </section>

      <section>
        <ScheduleList sessions={sessions} namesById={namesById} />
      </section>
    </main>
  )
}
