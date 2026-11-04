import { useEffect, useState } from 'react'
import { createFileRoute } from '@tanstack/react-router'
import { useLiveQuery } from '@tanstack/react-db'

import {
  curriculaCollection,
  curriculumSourcesCollection,
  mapCurriculumRow,
  mapSubjectRow,
  subjectsCollection,
} from '../curriculum/board.collection'

import { getBoard, getSubjectReviewDueCounts } from '../curriculum/curriculum.api'
import { getStreak } from '../curriculum/stats.api'
import { settle, settleNullable } from '../shared/load-result'
import { listCourseRefocusSuggestions } from '../curriculum/api-client'
import type { Curriculum, Subject } from '../curriculum/model'
import { browserTimeZone } from '../shared/browser-time-zone'
import { listLearningPaths } from '../learning-path/learning-path.api'
import { listStudySessions } from '../study-session/study-session.api'
import { DashboardView } from '../dashboard/dashboard-view'
import { getStudyOverview } from '../home/home.api'
import { pageHead } from '../shared/page-title'

export const Route = createFileRoute('/')({
  head: pageHead('Overview'),
  component: Home,
  loader: async () => {
    const [
      board,
      courseRefocusSuggestions,
      sessions,
      learningPaths,
      streak,
      studyOverview,
      subjectDueCounts,
    ] = await Promise.all([
      getBoard(),
      settle(listCourseRefocusSuggestions()),
      settle(listStudySessions()),
      settle(listLearningPaths({ data: { onlyActive: true } })),
      settleNullable(getStreak()),
      settle(getStudyOverview({ data: { tz: browserTimeZone() } })),
      settle(getSubjectReviewDueCounts({ data: { tz: browserTimeZone() } })),
    ])

    return {
      ...board,
      courseRefocusSuggestions,
      sessions,
      learningPaths,
      streak,
      studyOverview,
      subjectDueCounts,
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

  return (
    <>
      {isClient && <LiveDataBridge onData={setLive} />}
      <DashboardView
        curricula={live?.curricula ?? initial.curricula}
        courseRefocusSuggestions={initial.courseRefocusSuggestions}
        sessions={initial.sessions}
        learningPaths={initial.learningPaths}
        streak={initial.streak}
        subjects={live?.subjects ?? initial.subjects}
        studyOverview={initial.studyOverview}
        subjectDueCounts={initial.subjectDueCounts}
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
