import { createFileRoute } from '@tanstack/react-router'

import { AddKnowledgeForm } from '../knowledge-source/add-knowledge-form'

export const Route = createFileRoute('/add-knowledge')({
  component: AddKnowledgePage,
})

function AddKnowledgePage() {
  return (
    <main className="mx-auto max-w-3xl px-5 py-8 sm:px-8 sm:py-10">
      <header className="mb-6">
        <h1 className="text-2xl font-semibold tracking-tight">Add knowledge</h1>
        <p className="mt-1 text-sm text-neutral-500">
          Paste one or more blocks of prose — each becomes its own knowledge
          source for the detector to work through.
        </p>
      </header>

      <AddKnowledgeForm />
    </main>
  )
}
