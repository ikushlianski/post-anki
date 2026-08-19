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

import { getBoard, getTree } from '../curriculum/curriculum.api'
import { getStreak } from '../curriculum/stats.api'
import { listCourseRefocusSuggestions } from '../curriculum/api-client'
import { getAdminSettings } from '../admin-settings/admin-settings.api'
import type {
  Curriculum,
  CourseRefocusSuggestion,
  DashboardSubject,
  Subject,
} from '../curriculum/model'
import type { ModelTier } from '@post-anki/shared'
import { SubjectSection } from '../subject/subject-section'
import { CourseRefocusBanner } from '../curriculum/course-refocus-banner'
import { ContinueSessionCard } from '../home/continue-session-card'
import { selectResumableSession } from '../home/select-resumable-session'
import { DashboardTree } from '../dashboard/dashboard-tree'
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
      tree,
      streak,
      adminSettings,
    ] = await Promise.all([
      getBoard(),
      listCourseRefocusSuggestions().catch(() => []),
      listStudySessions().catch(() => []),
      listLearningPaths({ data: { onlyActive: true } }).catch(() => []),
      getTree().catch(() => []),
      getStreak().catch(() => null),
      getAdminSettings().catch(() => ({ testToggle: false, modelTier: 'cheap' as const })),
    ])

    return {
      ...board,
      courseRefocusSuggestions,
      sessions,
      learningPaths,
      tree,
      streak,
      globalModelTier: adminSettings.modelTier,
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
        tree={initial.tree}
        streak={initial.streak}
        globalModelTier={initial.globalModelTier}
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
  tree,
  streak,
  globalModelTier,
}: {
  subjects: Subject[]
  curricula: Curriculum[]
  courseRefocusSuggestions: CourseRefocusSuggestion[]
  sessions: StudySessionListItem[]
  learningPaths: LearningPath[]
  tree: DashboardSubject[]
  streak: Streak | null
  globalModelTier: ModelTier
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
        <h1 className="text-2xl font-semibold tracking-tight">Home</h1>
        <p className="mt-1 text-sm text-neutral-500">
          Everything you're learning and where each piece stands. Change any
          status to re-steer — drop a topic to Skipping, push one to Going
          deeper, or mark it Done.
        </p>
      </header>

      <ContinueSessionCard session={resumableSession} namesById={namesById} />

      <div className="mb-10">
        <DashboardTree tree={tree} streak={streak} />
      </div>

      <div className="mb-10">
        <CourseRefocusBanner suggestions={courseRefocusSuggestions} />
      </div>

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
        <div className="space-y-10">
          {subjects.map((subject) => (
            <SubjectSection
              key={subject.id}
              subject={subject}
              curricula={curricula.filter((c) => c.subjectId === subject.id)}
              allSubjects={subjects}
              globalModelTier={globalModelTier}
            />
          ))}
        </div>
      )}
    </main>
  )
}
