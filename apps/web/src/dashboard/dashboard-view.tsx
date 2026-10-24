import { useState } from 'react'
import type { ReactNode } from 'react'
import { Link, useRouter } from '@tanstack/react-router'

import type {
  LearningPath,
  Streak,
  StudySessionListItem,
  SubjectReviewDueCounts,
} from '@post-anki/shared'

import type { DueTopic } from '../curriculum/api-client'
import type { CourseRefocusSuggestion, Curriculum, Subject } from '../curriculum/model'
import type { LoadResult } from '../shared/load-result'
import { CourseRefocusBanner } from '../curriculum/course-refocus-banner'
import { SourceApprovalBanner } from '../curriculum/source-approval-banner'
import { StreakBanner } from '../curriculum/streak-banner'
import { ContinueSessionCard } from '../home/continue-session-card'
import { selectResumableSession } from '../home/select-resumable-session'
import { DashboardSubjectList } from './dashboard-subject-list'
import { DashboardSubjectSearch } from './dashboard-subject-search'
import { UnsortedDueBucket } from './unsorted-due-bucket'

export interface DashboardViewProps {
  subjects: Subject[]
  curricula: Curriculum[]
  courseRefocusSuggestions: LoadResult<CourseRefocusSuggestion[]>
  sessions: LoadResult<StudySessionListItem[]>
  learningPaths: LoadResult<LearningPath[]>
  streak: LoadResult<Streak>
  dueTopics: LoadResult<DueTopic[]>
  subjectDueCounts?: LoadResult<SubjectReviewDueCounts>
  onRenameSubject: (subjectId: string, name: string) => Promise<boolean>
  onDeleteSubject: (subjectId: string) => Promise<boolean>
  onCreateSubSubject: (parentId: string, name: string) => Promise<boolean>
  onMoveSubject: (subjectId: string, parentId: string | null) => Promise<boolean>
}

function LoadError({ children }: { children: ReactNode }) {
  return (
    <p role="alert" className="mb-6 text-sm text-red-600">
      {children}
    </p>
  )
}

export function DashboardView({
  subjects,
  curricula,
  courseRefocusSuggestions,
  sessions,
  learningPaths,
  streak,
  dueTopics,
  subjectDueCounts,
  onRenameSubject,
  onDeleteSubject,
  onCreateSubSubject,
  onMoveSubject,
}: DashboardViewProps) {
  const namesById: Record<string, string> = {}
  const dueBySubjectId = subjectDueCounts?.ok
    ? Object.fromEntries(subjectDueCounts.data.subjects.map((row) => [row.subjectId, row.dueCount]))
    : undefined

  for (const curriculum of curricula) {
    namesById[curriculum.id] = curriculum.name
  }

  if (learningPaths.ok) {
    for (const path of learningPaths.data) {
      namesById[path.id] = path.name
    }
  }

  const router = useRouter()
  const [isSearching, setIsSearching] = useState(false)

  const resumableSession = sessions.ok
    ? selectResumableSession(sessions.data, new Date())
    : null

  return (
    <main className="mx-auto max-w-7xl px-5 py-8 sm:px-8 sm:py-10">
      <header className="mb-6">
        <h1 className="text-2xl font-semibold tracking-tight">Your subjects</h1>
        <p className="mt-1 text-sm text-neutral-500">
          Everything you're learning and where each piece stands. Change any
          status to re-steer — drop a topic to Skipping, push one to Going
          deeper, or mark it Done.
        </p>
      </header>

      <DashboardSubjectSearch subjects={subjects} onSearchingChange={setIsSearching} />

      {sessions.ok ? (
        <ContinueSessionCard session={resumableSession} namesById={namesById} />
      ) : (
        <LoadError>Couldn't load your study sessions — try refreshing.</LoadError>
      )}

      {dueTopics.ok && dueTopics.data.length > 0 ? (
        <div data-testid="due-topics-section" className="mb-6">
          <h2 className="mb-3 text-xs font-medium uppercase tracking-wide text-neutral-400">
            Most pressing topics
          </h2>
          <ul className="space-y-2">
            {dueTopics.data.map((topic) => (
              <li key={topic.topicId}>
                <Link
                  to="/knowledge/answer"
                  search={{ topicId: topic.topicId }}
                  data-testid="due-topic-link"
                  className="flex items-center justify-between rounded-lg border border-neutral-200 bg-white px-4 py-3 hover:border-neutral-400"
                >
                  <span className="font-medium tracking-tight">{topic.title}</span>
                  <span className="text-sm text-neutral-400">
                    {topic.dueCount} due
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {!learningPaths.ok ? (
        <LoadError>Couldn't load your learning paths — try refreshing.</LoadError>
      ) : null}

      <SourceApprovalBanner curricula={curricula} />

      {streak.ok ? (
        <StreakBanner streak={streak.data} />
      ) : (
        <LoadError>Couldn't load your streak — try refreshing.</LoadError>
      )}

      <div className="mb-10">
        <CourseRefocusBanner suggestions={courseRefocusSuggestions} />
      </div>

      {isSearching ? null : (
        <>
          {subjectDueCounts && !subjectDueCounts.ok ? (
            <LoadError>Couldn't load your review counts — try refreshing.</LoadError>
          ) : null}

          {subjectDueCounts?.ok ? (
            <UnsortedDueBucket dueCount={subjectDueCounts.data.unsorted.dueCount} />
          ) : null}

          <h2 className="mb-3 text-xs font-medium uppercase tracking-wide text-neutral-400">
            Your subjects
          </h2>

          <DashboardSubjectList
            subjects={subjects}
            curricula={curricula}
            onRenameSubject={onRenameSubject}
            onDeleteSubject={onDeleteSubject}
            onCreateSubSubject={onCreateSubSubject}
            onMoveSubject={onMoveSubject}
            onSubjectOrderSaved={() => void router.invalidate()}
            dueBySubjectId={dueBySubjectId}
          />
        </>
      )}
    </main>
  )
}
