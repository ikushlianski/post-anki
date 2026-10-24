import { createFileRoute } from '@tanstack/react-router'

import { getBoard } from '../curriculum/curriculum.api'
import { DuplicateScanPanel } from '../subject-duplicate/duplicate-scan-panel'
import { listPendingDuplicateSuggestions } from '../subject-duplicate/subject-duplicate.api'
import { SubjectSuggestionPanel } from '../subject-suggestion/subject-suggestion-panel'
import { listPendingSubjectSuggestions } from '../subject-suggestion/subject-suggestion.api'

export const Route = createFileRoute('/duplicates')({
  component: DuplicatesPage,
  loader: async () => {
    const [board, duplicateSuggestions, subjectSuggestions] = await Promise.all([
      getBoard(),
      listPendingDuplicateSuggestions({ data: 'pending' }),
      listPendingSubjectSuggestions({ data: 'pending' }),
    ])

    return { subjects: board.subjects, duplicateSuggestions, subjectSuggestions }
  },
})

function DuplicatesPage() {
  const { subjects, duplicateSuggestions, subjectSuggestions } = Route.useLoaderData()

  return (
    <main className="mx-auto max-w-3xl px-5 py-8 sm:px-8 sm:py-10">
      <header className="mb-6">
        <h1 className="text-2xl font-semibold tracking-tight">Duplicates and suggestions</h1>
        <p className="mt-1 text-sm text-neutral-500">
          Find near-duplicate subjects and review suggested new subjects.
        </p>
      </header>

      <DuplicateScanPanel initialSuggestions={duplicateSuggestions} allSubjects={subjects} />
      <SubjectSuggestionPanel initialSuggestions={subjectSuggestions} allSubjects={subjects} />
    </main>
  )
}
