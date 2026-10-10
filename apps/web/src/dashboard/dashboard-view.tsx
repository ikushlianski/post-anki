import type { ReactNode } from 'react'
import { Link } from '@tanstack/react-router'

import type { LearningPath, Streak, StudySessionListItem } from '@post-anki/shared'

import type { DueTopic } from '../curriculum/api-client'
import type { CourseRefocusSuggestion, Curriculum, Subject } from '../curriculum/model'
import type { LoadResult } from '../shared/load-result'
import { CourseRefocusBanner } from '../curriculum/course-refocus-banner'
import { SourceApprovalBanner } from '../curriculum/source-approval-banner'
import { StreakBanner } from '../curriculum/streak-banner'
import { ContinueSessionCard } from '../home/continue-session-card'
import { selectResumableSession } from '../home/select-resumable-session'
import { DashboardSubjectList } from './dashboard-subject-list'

export interface DashboardViewProps {
  subjects: Subject[]
  curricula: Curriculum[]
  courseRefocusSuggestions: LoadResult<CourseRefocusSuggestion[]>
  sessions: LoadResult<StudySessionListItem[]>
  learningPaths: LoadResult<LearningPath[]>
  streak: LoadResult<Streak>
  dueTopics: LoadResult<DueTopic[]>
  onRenameSubject: (subjectId: string, name: string) => Promise<boolean>
  onDeleteSubject: (subjectId: string) => Promise<boolean>
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
  onRenameSubject,
  onDeleteSubject,
}: DashboardViewProps) {
  const namesById: Record<string, string> = {}

  for (const curriculum of curricula) {
    namesById[curriculum.id] = curriculum.name
  }

  if (learningPaths.ok) {
    for (const path of learningPaths.data) {
      namesById[path.id] = path.name
    }
  }

  const resumableSession = sessions.ok
    ? selectResumableSession(sessions.data, new Date())
    : null

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

      <h2 className="mb-3 text-xs font-medium uppercase tracking-wide text-neutral-400">
        Your subjects
      </h2>

      <DashboardSubjectList
        subjects={subjects}
        curricula={curricula}
        onRenameSubject={onRenameSubject}
        onDeleteSubject={onDeleteSubject}
      />
    </main>
  )
}
