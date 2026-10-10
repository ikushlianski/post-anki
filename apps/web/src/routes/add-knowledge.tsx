import { createFileRoute } from '@tanstack/react-router'
import { z } from 'zod'

import { AddKnowledgeForm } from '../knowledge-source/add-knowledge-form'

export const Route = createFileRoute('/add-knowledge')({
  validateSearch: z.object({
    subjectId: z.string().min(1).optional().catch(undefined),
  }),
  component: AddKnowledgePage,
})

function AddKnowledgePage() {
  const { subjectId } = Route.useSearch()

  return (
    <main className="mx-auto max-w-3xl px-5 py-8 sm:px-8 sm:py-10">
      <header className="mb-6">
        <h1 className="text-2xl font-semibold tracking-tight">Add knowledge</h1>
        <p className="mt-1 text-sm text-neutral-500">
          Paste text and the app will suggest knowledge items for you to approve.
        </p>
      </header>

      <AddKnowledgeForm initialSubjectId={subjectId} />
    </main>
  )
}
