import { Link, createFileRoute, useRouter } from '@tanstack/react-router'

import { getBoard } from '../curriculum/curriculum.api'
import { SubjectBreadcrumb } from '../subject/subject-breadcrumb'
import { SubjectHeaderMenu } from '../subject/subject-header-menu'
import { SubjectSection } from '../subject/subject-section'
import { settle } from '../shared/load-result'
import { SubjectPrioritiesPanel } from '../study-goal/subject-priorities-panel'
import { StudyForecastPanel } from '../study-plan/study-forecast-panel'
import { browserTimeZone, getStudyForecast } from '../study-plan/study-forecast.api'
import { SubjectStudyOptionsForm } from '../subject-study-options/subject-study-options-form'
import {
  getSubjectStudyOptions,
  updateSubjectStudyOptions,
} from '../subject-study-options/subject-study-options.api'
import { pageHead } from '../shared/page-title'

export const Route = createFileRoute('/subject/$subjectId')({
  head: pageHead('Subject'),
  component: SubjectDetailPage,
  loader: async ({ params }) => {
    const [board, studyOptions, forecast] = await Promise.all([
      getBoard(),
      settle(getSubjectStudyOptions({ data: params.subjectId })),
      settle(getStudyForecast({ data: { subjectId: params.subjectId, tz: browserTimeZone() } })),
    ])
    const subject = board.subjects.find((s) => s.id === params.subjectId) ?? null

    return {
      subject,
      studyOptions,
      forecast,
      subjects: board.subjects,
      curricula: board.curricula,
      categories: board.categories,
    }
  },
})

function SubjectDetailPage() {
  const { subject, studyOptions, forecast, subjects, curricula, categories } = Route.useLoaderData()
  const router = useRouter()

  if (!subject) {
    return (
      <main className="mx-auto max-w-3xl px-5 py-8 sm:px-8 sm:py-10">
        <p className="text-sm text-neutral-500">Subject not found.</p>
        <Link to="/" className="text-sm underline">
          Back to home
        </Link>
      </main>
    )
  }

  return (
    <main className="mx-auto max-w-3xl px-5 py-8 sm:px-8 sm:py-10">
      <Link to="/subjects" className="inline-flex min-h-[44px] items-center text-sm text-neutral-500 hover:text-neutral-900 sm:min-h-0">
        ← All subjects
      </Link>
      <SubjectBreadcrumb subjects={subjects} subjectId={subject.id} />

      <header className="mb-6 mt-3 flex items-center justify-between gap-3">
        <h1 className="min-w-0 text-2xl font-semibold tracking-tight">{subject.name}</h1>
        <div className="flex shrink-0 items-center gap-2">
          <SubjectHeaderMenu subject={subject} />
        </div>
      </header>

      <SubjectSection
        subject={subject}
        curricula={curricula.filter((c) => c.subjectId === subject.id)}
        allSubjects={subjects}
        categories={categories.filter((c) => c.subjectId === subject.id)}
        allCategories={categories}
      />

      <SubjectPrioritiesPanel
        subjectId={subject.id}
        subjectNames={Object.fromEntries(subjects.map((s) => [s.id, s.name]))}
      />

      {forecast.ok ? (
        <StudyForecastPanel forecast={forecast.data} />
      ) : (
        <p data-testid="study-forecast-load-error" className="mt-8 text-sm text-red-600">
          Could not load the study forecast. Reload to try again.
        </p>
      )}

      {studyOptions.ok ? (
        <SubjectStudyOptionsForm
          subjectId={subject.id}
          initial={studyOptions.data}
          subjectNames={Object.fromEntries(subjects.map((s) => [s.id, s.name]))}
          forecast={forecast.ok ? forecast.data : null}
          onSave={async (patch) => {
            const saved = await updateSubjectStudyOptions({ data: { subjectId: subject.id, patch } })

            await router.invalidate()

            return saved
          }}
        />
      ) : (
        <p data-testid="subject-study-options-load-error" className="mt-8 text-sm text-red-600">
          Could not load study options. Reload to try again.
        </p>
      )}
    </main>
  )
}
