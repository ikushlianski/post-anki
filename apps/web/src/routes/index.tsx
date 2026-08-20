import { useEffect, useState } from 'react'
import { Link, createFileRoute } from '@tanstack/react-router'
import { useLiveQuery } from '@tanstack/react-db'

import {
  curriculaCollection,
  curriculumSourcesCollection,
  mapCurriculumRow,
  mapSubjectRow,
  subjectsCollection,
} from '../curriculum/board.collection'
import type {
  LearningPath,
  Streak,
  StudySessionListItem,
} from '@post-anki/shared'

import { getBoard } from '../curriculum/curriculum.api'
import { getStreak } from '../curriculum/stats.api'
import { listCourseRefocusSuggestions } from '../curriculum/api-client'
import type {
  Curriculum,
  CourseRefocusSuggestion,
  Subject,
} from '../curriculum/model'
import { CourseRefocusBanner } from '../curriculum/course-refocus-banner'
import { ContinueSessionCard } from '../home/continue-session-card'
import { selectResumableSession } from '../home/select-resumable-session'
import { StreakBanner } from '../curriculum/streak-banner'
import { listLearningPaths } from '../learning-path/learning-path.api'
import { listStudySessions } from '../study-session/study-session.api'

export const Route = createFileRoute('/')({
  component: Home,
  loader: async () => {
    const [
      board,
      courseRefocusSuggestions,
      sessions,
      learningPaths,
      streak,
    ] = await Promise.all([
      getBoard(),
      listCourseRefocusSuggestions().catch(() => []),
      listStudySessions().catch(() => []),
      listLearningPaths({ data: { onlyActive: true } }).catch(() => []),
      getStreak().catch(() => null),
    ])

    return {
      ...board,
      courseRefocusSuggestions,
      sessions,
      learningPaths,
      streak,
    }
  },
})

interface LiveBoardData {
  subjects: Subject[]
  curricula: Curriculum[]
}

function Home() {
  const initial = Route.useLoaderData()
  const [isClient, setIsClient] = useState(false)
  const [live, setLive] = useState<LiveBoardData | null>(null)

  useEffect(() => {
    setIsClient(true)
  }, [])

  // HomeView stays mounted at the same tree position across the isClient
  // flip — LiveDataBridge is a SIBLING, not a wrapper, so it can mount only
  // client-side (useLiveQuery calls useSyncExternalStore with no
  // getServerSnapshot, which errors out SSR entirely if called there) without
  // ever remounting HomeView and wiping out CreateSubjectForm's in-progress
  // input state.
  return (
    <>
      {isClient && <LiveDataBridge onData={setLive} />}
      <HomeView
        subjects={live?.subjects ?? initial.subjects}
        curricula={live?.curricula ?? initial.curricula}
        courseRefocusSuggestions={initial.courseRefocusSuggestions}
        sessions={initial.sessions}
        learningPaths={initial.learningPaths}
        streak={initial.streak}
      />
    </>
  )
}

function LiveDataBridge({ onData }: { onData: (data: LiveBoardData) => void }) {
  const subjectsQuery = useLiveQuery((q) => q.from({ subject: subjectsCollection }), [])
  const curriculaQuery = useLiveQuery((q) => q.from({ curriculum: curriculaCollection }), [])
  const sourcesQuery = useLiveQuery((q) => q.from({ source: curriculumSourcesCollection }), [])

  // Live collections stay on the SSR/loader snapshot until Electric has
  // finished its initial sync, so the board never flashes empty while
  // catching up — only once all three shapes report `ready` do we switch
  // over to the reactive, always-fresh local-first data.
  const liveReady =
    subjectsQuery.status === 'ready' &&
    curriculaQuery.status === 'ready' &&
    sourcesQuery.status === 'ready'

  const subjectRows = subjectsQuery.data
  const curriculumRows = curriculaQuery.data
  const sourceRows = sourcesQuery.data

  useEffect(() => {
    if (liveReady && subjectRows && curriculumRows && sourceRows) {
      onData({
        subjects: subjectRows.map(mapSubjectRow),
        curricula: curriculumRows.map((row) => mapCurriculumRow(row, sourceRows)),
      })
    }
  }, [liveReady, subjectRows, curriculumRows, sourceRows, onData])

  return null
}

function HomeView({
  subjects,
  curricula,
  courseRefocusSuggestions,
  sessions,
  learningPaths,
  streak,
}: {
  subjects: Subject[]
  curricula: Curriculum[]
  courseRefocusSuggestions: CourseRefocusSuggestion[]
  sessions: StudySessionListItem[]
  learningPaths: LearningPath[]
  streak: Streak | null
}) {
  const namesById: Record<string, string> = {}

  for (const curriculum of curricula) {
    namesById[curriculum.id] = curriculum.name
  }

  for (const path of learningPaths) {
    namesById[path.id] = path.name
  }

  const resumableSession = selectResumableSession(sessions, new Date())

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

      <ContinueSessionCard session={resumableSession} namesById={namesById} />

      {streak ? <StreakBanner streak={streak} /> : null}

      <div className="mb-10">
        <CourseRefocusBanner suggestions={courseRefocusSuggestions} />
      </div>

      <h2 className="mb-3 text-xs font-medium uppercase tracking-wide text-neutral-400">
        Your subjects
      </h2>

      {subjects.length === 0 ? (
        <div data-testid="home-empty-state" className="rounded-lg border border-neutral-200 bg-neutral-50 p-8 text-center">
          <p className="text-neutral-600">
            You haven't created a subject yet.{' '}
            <Link to="/subjects/new" className="font-medium text-indigo-600 hover:text-indigo-700">
              Create your first subject
            </Link>
          </p>
        </div>
      ) : (
        <ul className="space-y-2">
          {subjects.map((subject) => {
            const subjectCurricula = curricula.filter((c) => c.subjectId === subject.id)

            return (
              <li key={subject.id}>
                <Link
                  to="/subject/$subjectId"
                  params={{ subjectId: subject.id }}
                  data-testid="subject-name"
                  className="flex items-center justify-between rounded-lg border border-neutral-200 bg-white px-4 py-3 hover:border-neutral-400"
                >
                  <span className="font-medium tracking-tight">{subject.name}</span>
                  <span className="text-sm text-neutral-400">
                    {subjectCurricula.length === 0
                      ? 'No curricula yet'
                      : `${subjectCurricula.length} curricul${subjectCurricula.length === 1 ? 'um' : 'a'}`}
                  </span>
                </Link>
              </li>
            )
          })}
        </ul>
      )}
    </main>
  )
}
