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
import { getBoard } from '../curriculum/curriculum.api'
import type { Curriculum, Subject } from '../curriculum/model'
import { CreateSubjectForm } from '../subject/create-subject-form'
import { SubjectSection } from '../subject/subject-section'

export const Route = createFileRoute('/')({
  component: Home,
  loader: () => getBoard(),
})

function Home() {
  const initial = Route.useLoaderData()
  const [isClient, setIsClient] = useState(false)

  useEffect(() => {
    setIsClient(true)
  }, [])

  const subjectsQuery = useLiveQuery(
    (q) => (isClient ? q.from({ subject: subjectsCollection }) : null),
    [isClient],
  )
  const curriculaQuery = useLiveQuery(
    (q) => (isClient ? q.from({ curriculum: curriculaCollection }) : null),
    [isClient],
  )
  const sourcesQuery = useLiveQuery(
    (q) => (isClient ? q.from({ source: curriculumSourcesCollection }) : null),
    [isClient],
  )

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

  const subjects: Subject[] =
    liveReady && subjectRows ? subjectRows.map(mapSubjectRow) : initial.subjects

  const curricula: Curriculum[] =
    liveReady && curriculumRows && sourceRows
      ? curriculumRows.map((row) => mapCurriculumRow(row, sourceRows))
      : initial.curricula

  return (
    <main className="mx-auto max-w-3xl px-5 py-8 sm:px-8 sm:py-10">
      <header className="mb-8">
        <h1 className="text-2xl font-semibold tracking-tight">Curricula</h1>
        <p className="mt-1 text-sm text-neutral-500">
          Courses you decide are worth knowing — each built from sources you
          provide, not from a model's memory.
        </p>
      </header>

      <div className="mb-10">
        <CreateSubjectForm />
      </div>

      <div className="space-y-10">
        {subjects.map((subject) => (
          <SubjectSection
            key={subject.id}
            subject={subject}
            curricula={curricula.filter((c) => c.subjectId === subject.id)}
          />
        ))}
      </div>
    </main>
  )
}
