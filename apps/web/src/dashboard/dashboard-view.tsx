import type { ReactNode } from 'react'
import type {
  LearningPath,
  Streak,
  StudyOverview,
  StudySessionListItem,
  SubjectReviewDueCounts,
} from '@post-anki/shared'

import type { CourseRefocusSuggestion, Curriculum, Subject } from '../curriculum/model'
import type { LoadResult } from '../shared/load-result'
import { CourseRefocusBanner } from '../curriculum/course-refocus-banner'
import { SourceApprovalBanner } from '../curriculum/source-approval-banner'
import { ContinueSessionCard } from '../home/continue-session-card'
import { selectResumableSession } from '../home/select-resumable-session'
import { BusiestSubjects } from '../home/busiest-subjects'
import { HomeHeader } from '../home/home-header'
import { ProgressStrip } from '../home/progress-strip'
import { StartHereCard } from '../home/start-here-card'
import { StudyNowCard } from '../home/study-now-card'
import { HomeStreakCard } from '../motivation/streak-card'
import { WeeklyDigestCard } from '../home/weekly-digest-card'
import { WeeklySummaryCard } from '../motivation/weekly-summary-card'
import { HomeStudyGoals } from '../study-goal/home-study-goals'

export interface DashboardViewProps {
  curricula: Curriculum[]
  courseRefocusSuggestions: LoadResult<CourseRefocusSuggestion[]>
  sessions: LoadResult<StudySessionListItem[]>
  learningPaths: LoadResult<LearningPath[]>
  streak: LoadResult<Streak>
  subjects: Subject[]
  studyOverview: LoadResult<StudyOverview>
  subjectDueCounts?: LoadResult<SubjectReviewDueCounts>
}

function LoadError({ children }: { children: ReactNode }) {
  return (
    <p role="alert" className="mb-6 text-sm text-red-600">
      {children}
    </p>
  )
}

export function DashboardView({
  curricula,
  courseRefocusSuggestions,
  sessions,
  learningPaths,
  streak,
  subjects,
  studyOverview,
  subjectDueCounts,
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

  const isNewAccount = studyOverview.ok && !studyOverview.data.hasCards && subjects.length === 0

  return (
    <main className="mx-auto max-w-7xl px-5 py-8 sm:px-8 sm:py-10">
      <HomeHeader />

      {isNewAccount ? (
        <StartHereCard />
      ) : (
        <>
          <div className="mb-6 grid gap-4 md:grid-cols-2">
            <StudyNowCard overview={studyOverview} />
            <ProgressStrip overview={studyOverview} streak={streak} />
          </div>

          <HomeStreakCard />

          <HomeStudyGoals subjectNames={Object.fromEntries(subjects.map((subject) => [subject.id, subject.name]))} />

          <WeeklyDigestCard />

          <WeeklySummaryCard />

          <BusiestSubjects subjects={subjects} counts={subjectDueCounts} />
        </>
      )}

      {sessions.ok ? (
        <ContinueSessionCard session={resumableSession} namesById={namesById} />
      ) : (
        <LoadError>Couldn't load your study sessions — try refreshing.</LoadError>
      )}

      {!learningPaths.ok ? (
        <LoadError>Couldn't load your learning paths — try refreshing.</LoadError>
      ) : null}

      <SourceApprovalBanner curricula={curricula} />

      <div className="mb-10">
        <CourseRefocusBanner suggestions={courseRefocusSuggestions} />
      </div>
    </main>
  )
}
