import { createFileRoute } from '@tanstack/react-router'

import { getBoard } from '../curriculum/curriculum.api'
import { getDomainMapForSubject } from '../domain-map/domain-map.api'
import { NotesBrowser } from '../note/notes-browser'
import { reviewNote, searchNotes } from '../note/note.api'

export const Route = createFileRoute('/notes')({
  component: NotesPage,
  loader: async () => {
    const board = await getBoard()

    return { subjects: board.subjects }
  },
})

function NotesPage() {
  const { subjects } = Route.useLoaderData()

  return (
    <main className="mx-auto max-w-3xl px-5 py-8 sm:px-8 sm:py-10">
      <header className="mb-6">
        <h1 className="text-2xl font-semibold tracking-tight">Notes</h1>
        <p className="mt-1 text-sm text-neutral-500">
          Search what you've written, or reread one note at a time. Nothing here
          is tracked as owed — opening this page has no consequence for not
          opening it yesterday.
        </p>
      </header>

      <NotesBrowser
        subjects={subjects.map((subject) => ({ id: subject.id, name: subject.name }))}
        onSearch={(params) => searchNotes({ data: params })}
        onLoadDomainMap={(subjectId) => getDomainMapForSubject({ data: subjectId })}
        onReview={(excludeIds) => reviewNote({ data: excludeIds })}
      />
    </main>
  )
}
