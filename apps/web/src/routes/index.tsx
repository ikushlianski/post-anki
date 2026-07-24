import { useEffect, useState } from 'react'
import { Link, createFileRoute } from '@tanstack/react-router'
import { useLiveQuery } from '@tanstack/react-db'
import { useQuery } from '@tanstack/react-query'

import {
  curriculaCollection,
  curriculumSourcesCollection,
  mapCurriculumRow,
  mapSubjectRow,
  subjectsCollection,
} from '../curriculum/board.collection'
import { getBoard, listTags } from '../curriculum/curriculum.api'
import type { Curriculum, Subject } from '../curriculum/model'
import { CreateSubjectForm } from '../subject/create-subject-form'
import { SubjectSection } from '../subject/subject-section'

export const Route = createFileRoute('/')({
  component: Home,
  loader: () => getBoard(),
})

function TagList() {
  const { data: tags } = useQuery({
    queryKey: ['tags'],
    queryFn: () => listTags(),
  })

  if (!tags || tags.length === 0) {
    return null
  }

  return (
    <div className="mb-10" data-testid="tag-list">
      <h2 className="mb-2 text-xs font-medium uppercase tracking-wide text-neutral-400">
        Cross-cutting tags
      </h2>
      <div className="flex flex-wrap gap-2">
        {tags.map((tag) => (
          <Link
            key={tag.id}
            to="/probe/tag/$tagId"
            params={{ tagId: tag.id }}
            data-testid={`tag-list-item-${tag.id}`}
            className="rounded-full bg-indigo-50 px-3 py-1 text-sm text-indigo-700 hover:bg-indigo-100"
          >
            #{tag.name}
          </Link>
        ))}
      </div>
    </div>
  )
}

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

      <TagList />

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
