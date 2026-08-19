import { createFileRoute } from '@tanstack/react-router'

import { CreateSubjectForm } from '../subject/create-subject-form'

export const Route = createFileRoute('/subjects/new')({
  component: NewSubjectPage,
})

function NewSubjectPage() {
  return (
    <main className="mx-auto max-w-3xl px-5 py-8 sm:px-8 sm:py-10">
      <header className="mb-6">
        <h1 className="text-2xl font-semibold tracking-tight">New subject</h1>
        <p className="mt-1 text-sm text-neutral-500">
          Courses you decide are worth knowing — each built from sources you
          provide, not from a model's memory.
        </p>
      </header>

      <CreateSubjectForm />
    </main>
  )
}
