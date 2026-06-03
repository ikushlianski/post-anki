import { createFileRoute } from '@tanstack/react-router'

import { getBoard } from '../curriculum/curriculum.api'
import { CreateSubjectForm } from '../subject/create-subject-form'
import { SubjectSection } from '../subject/subject-section'

export const Route = createFileRoute('/')({
  component: Home,
  loader: () => getBoard(),
})

function Home() {
  const { subjects, curricula } = Route.useLoaderData()

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
