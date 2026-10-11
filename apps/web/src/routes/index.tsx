import { useEffect, useState } from 'react'
import { createFileRoute, useRouter } from '@tanstack/react-router'
import { useLiveQuery } from '@tanstack/react-db'

import {
  curriculaCollection,
  curriculumSourcesCollection,
  mapCurriculumRow,
  mapSubjectRow,
  subjectsCollection,
} from '../curriculum/board.collection'

import { getBoard, getDueTopics, getSubjectReviewDueCounts } from '../curriculum/curriculum.api'
import { getStreak } from '../curriculum/stats.api'
import { settle, settleNullable } from '../shared/load-result'
import { listCourseRefocusSuggestions } from '../curriculum/api-client'
import type { Curriculum, Subject } from '../curriculum/model'
import { browserTimeZone } from '../knowledge-bit/anki-review-session-actions'
import { listLearningPaths } from '../learning-path/learning-path.api'
import { listStudySessions } from '../study-session/study-session.api'
import {
  createSubject,
  deleteSubject as deleteSubjectRequest,
  updateSubjectName,
  updateSubjectParent,
} from '../subject/subject.api'
import { DashboardView } from '../dashboard/dashboard-view'

export const Route = createFileRoute('/')({
  component: Home,
  loader: async () => {
    const [
      board,
      courseRefocusSuggestions,
      sessions,
      learningPaths,
      streak,
      dueTopics,
      subjectDueCounts,
    ] = await Promise.all([
      getBoard(),
      settle(listCourseRefocusSuggestions()),
      settle(listStudySessions()),
      settle(listLearningPaths({ data: { onlyActive: true } })),
      settleNullable(getStreak()),
      settle(getDueTopics({ data: { limit: 5 } })),
      settle(getSubjectReviewDueCounts({ data: { tz: browserTimeZone() } })),
    ])

    return {
      ...board,
      courseRefocusSuggestions,
      sessions,
      learningPaths,
      streak,
      dueTopics,
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
  const router = useRouter()
  const [isClient, setIsClient] = useState(false)
  const [live, setLive] = useState<LiveBoardData | null>(null)

  useEffect(() => {
    setIsClient(true)
  }, [])

  async function renameSubject(subjectId: string, name: string): Promise<boolean> {
    try {
      await updateSubjectName({ data: { subjectId, name } })
      await router.invalidate()
      return true
    } catch {
      return false
    }
  }

  async function createSubSubject(parentId: string, name: string): Promise<boolean> {
    try {
      await createSubject({ data: { name, kind: 'architecture-mentor', parentId } })
      await router.invalidate()
      return true
    } catch {
      return false
    }
  }

  async function moveSubject(subjectId: string, parentId: string | null): Promise<boolean> {
    try {
      await updateSubjectParent({ data: { subjectId, parentId } })
      await router.invalidate()
      return true
    } catch {
      return false
    }
  }

  async function deleteSubject(subjectId: string): Promise<boolean> {
    try {
      await deleteSubjectRequest({ data: subjectId })
      await router.invalidate()
      return true
    } catch {
      return false
    }
  }

  // DashboardView stays mounted at the same tree position across the isClient
  // flip — LiveDataBridge is a SIBLING, not a wrapper, so it can mount only
  // client-side (useLiveQuery calls useSyncExternalStore with no
  // getServerSnapshot, which errors out SSR entirely if called there) without
  // ever remounting DashboardView and wiping out CreateSubjectForm's in-progress
  // input state.
  return (
    <>
      {isClient && <LiveDataBridge onData={setLive} />}
      <DashboardView
        subjects={live?.subjects ?? initial.subjects}
        curricula={live?.curricula ?? initial.curricula}
        courseRefocusSuggestions={initial.courseRefocusSuggestions}
        sessions={initial.sessions}
        learningPaths={initial.learningPaths}
        streak={initial.streak}
        dueTopics={initial.dueTopics}
        subjectDueCounts={initial.subjectDueCounts}
        onRenameSubject={renameSubject}
        onDeleteSubject={deleteSubject}
        onCreateSubSubject={createSubSubject}
        onMoveSubject={moveSubject}
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
