import { createFileRoute } from '@tanstack/react-router'

import { getBoard } from '../curriculum/curriculum.api'
import { DuplicateScanPanel } from '../subject-duplicate/duplicate-scan-panel'
import { listPendingDuplicateSuggestions } from '../subject-duplicate/subject-duplicate.api'

export const Route = createFileRoute('/duplicates')({
  component: DuplicatesPage,
  loader: async () => {
    const board = await getBoard()
    const duplicateSuggestions = await listPendingDuplicateSuggestions({ data: 'pending' })

    return { subjects: board.subjects, duplicateSuggestions }
  },
})

function DuplicatesPage() {
  const { subjects, duplicateSuggestions } = Route.useLoaderData()

  return (
    <main className="mx-auto max-w-3xl px-5 py-8 sm:px-8 sm:py-10">
      <header className="mb-6">
        <h1 className="text-2xl font-semibold tracking-tight">Duplicates</h1>
        <p className="mt-1 text-sm text-neutral-500">
          Scan for subjects that look like near-duplicates of each other.
        </p>
      </header>

      <DuplicateScanPanel initialSuggestions={duplicateSuggestions} allSubjects={subjects} />
    </main>
  )
}
