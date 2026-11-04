import { createFileRoute } from '@tanstack/react-router'
import { useState } from 'react'
import { z } from 'zod'

import { isHttpUrl } from '../knowledge-source/knowledge-form-blocks'
import { readKnowledgeDraft, writeKnowledgeDraft } from '../knowledge-source/knowledge-draft-storage'
import { AddKnowledgeForm } from '../knowledge-source/add-knowledge-form'
import { AddKnowledgeGoalPanel } from '../study-goal/add-knowledge-goal-panel'
import { pageHead } from '../shared/page-title'

export const Route = createFileRoute('/add-knowledge')({
  head: pageHead('Add knowledge'),
  validateSearch: z.object({
    subjectId: z.string().min(1).optional().catch(undefined),
    q: z.string().trim().min(1).max(500).optional().catch(undefined),
  }),
  component: AddKnowledgePage,
})

function AddKnowledgePage() {
  const { subjectId, q } = Route.useSearch()

  useState(() => {
    if (q && !readKnowledgeDraft()) {
      writeKnowledgeDraft([{ type: isHttpUrl(q) ? 'url' : 'text', value: q }])
    }
  })

  return (
    <main className="mx-auto max-w-3xl px-5 py-8 sm:px-8 sm:py-10">
      <header className="mb-6">
        <h1 className="text-2xl font-semibold tracking-tight">Add knowledge</h1>
        <p className="mt-1 text-sm text-neutral-500">
          Paste text and the app will suggest knowledge items for you to approve.
        </p>
      </header>

      <AddKnowledgeGoalPanel />

      <AddKnowledgeForm initialSubjectId={subjectId} />
    </main>
  )
}
