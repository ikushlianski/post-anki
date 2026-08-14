import { useEffect, useState } from 'react'
import { Link, createFileRoute } from '@tanstack/react-router'
import { useLiveQuery } from '@tanstack/react-db'
import { useQuery, useQueryClient } from '@tanstack/react-query'

import {
  curriculaCollection,
  curriculumSourcesCollection,
  mapCurriculumRow,
  mapSubjectRow,
  subjectsCollection,
} from '../curriculum/board.collection'
import type { SubjectDuplicateSuggestion } from '@post-anki/shared'

import { getBoard, listTags, mergeTags } from '../curriculum/curriculum.api'
import { listCourseRefocusSuggestions } from '../curriculum/api-client'
import type { Curriculum, CourseRefocusSuggestion, Subject, Tag } from '../curriculum/model'
import { CreateSubjectForm } from '../subject/create-subject-form'
import { SubjectSection } from '../subject/subject-section'
import { CourseRefocusBanner } from '../curriculum/course-refocus-banner'
import { DuplicateScanPanel } from '../subject-duplicate/duplicate-scan-panel'
import { listPendingDuplicateSuggestions } from '../subject-duplicate/subject-duplicate.api'

export const Route = createFileRoute('/')({
  component: Home,
  loader: async () => {
    const [board, duplicateSuggestions, courseRefocusSuggestions] = await Promise.all([
      getBoard(),
      listPendingDuplicateSuggestions({ data: 'pending' }),
      listCourseRefocusSuggestions().catch(() => []),
    ])

    return { ...board, duplicateSuggestions, courseRefocusSuggestions }
  },
})

function TagMergeControl({
  tag,
  allTags,
  onMerged,
}: {
  tag: Tag
  allTags: Tag[]
  onMerged: () => void
}) {
  const [armed, setArmed] = useState(false)
  const [busy, setBusy] = useState(false)
  const [targetTagId, setTargetTagId] = useState('')

  const options = allTags.filter((candidate) => candidate.id !== tag.id)

  async function confirm() {
    if (!targetTagId) {
      return
    }

    setBusy(true)
    await mergeTags({ data: { targetTagId, sourceTagId: tag.id } })
    setBusy(false)
    setArmed(false)
    onMerged()
  }

  if (!armed) {
    return (
      <button
        type="button"
        data-testid={`tag-list-merge-button-${tag.id}`}
        onClick={() => setArmed(true)}
        className="text-indigo-400 hover:text-indigo-700"
        aria-label={`Merge tag ${tag.name}`}
      >
        ⇄
      </button>
    )
  }

  return (
    <span className="flex items-center gap-1">
      <select
        data-testid={`tag-list-merge-target-select-${tag.id}`}
        value={targetTagId}
        onChange={(event) => setTargetTagId(event.target.value)}
        className="rounded-md border border-neutral-200 px-1 py-0.5 text-xs text-neutral-700"
      >
        <option value="">merge into…</option>
        {options.map((option) => (
          <option key={option.id} value={option.id}>
            {option.name}
          </option>
        ))}
      </select>
      <button
        type="button"
        disabled={busy || !targetTagId}
        data-testid={`tag-list-merge-confirm-${tag.id}`}
        onClick={confirm}
        className="font-medium text-indigo-600 hover:text-indigo-700 disabled:opacity-40"
      >
        ✓
      </button>
      <button
        type="button"
        data-testid={`tag-list-merge-cancel-${tag.id}`}
        onClick={() => setArmed(false)}
        className="text-neutral-400 hover:text-neutral-700"
      >
        ✕
      </button>
    </span>
  )
}

function TagList() {
  const queryClient = useQueryClient()
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
          <span
            key={tag.id}
            className="flex items-center gap-1.5 rounded-full bg-indigo-50 px-3 py-1 text-sm text-indigo-700"
          >
            <Link
              to="/probe/tag/$tagId"
              params={{ tagId: tag.id }}
              data-testid={`tag-list-item-${tag.id}`}
              className="hover:underline"
            >
              #{tag.name}
            </Link>
            <TagMergeControl
              tag={tag}
              allTags={tags}
              onMerged={() => queryClient.invalidateQueries({ queryKey: ['tags'] })}
            />
          </span>
        ))}
      </div>
    </div>
  )
}

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
        initialDuplicateSuggestions={initial.duplicateSuggestions}
        courseRefocusSuggestions={initial.courseRefocusSuggestions}
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
  initialDuplicateSuggestions,
  courseRefocusSuggestions,
}: {
  subjects: Subject[]
  curricula: Curriculum[]
  initialDuplicateSuggestions: SubjectDuplicateSuggestion[]
  courseRefocusSuggestions: CourseRefocusSuggestion[]
}) {
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

      <div className="mb-10">
        <CourseRefocusBanner suggestions={courseRefocusSuggestions} />
      </div>

      <DuplicateScanPanel
        initialSuggestions={initialDuplicateSuggestions}
        allSubjects={subjects}
      />

      <TagList />

      <div className="space-y-10">
        {subjects.map((subject) => (
          <SubjectSection
            key={subject.id}
            subject={subject}
            curricula={curricula.filter((c) => c.subjectId === subject.id)}
            allSubjects={subjects}
          />
        ))}
      </div>
    </main>
  )
}
